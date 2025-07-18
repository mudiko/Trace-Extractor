const { parseMessageContent } = require('./extractor');

/**
 * Reconstruct conversation from bubbles and checkpoints
 */
function reconstructConversation(composerId, bubbles, checkpoints, codeDiffs, composerData) {
    const messages = [];
    
    // Get all bubbles for this composer
    const composerBubbles = bubbles[composerId] || {};
    const composerCheckpoints = checkpoints[composerId] || {};
    const composerCodeDiffs = codeDiffs[composerId] || {};
    
    // Check if we have conversation order from composer data
    const conversationOrder = composerData.fullConversationHeadersOnly || [];
    
    // Sort bubbles by conversation order if available, otherwise by timestamp
    let sortedBubbles;
    if (conversationOrder.length > 0) {
        // Use conversation order from composer data
        const bubbleOrderMap = new Map();
        conversationOrder.forEach((header, index) => {
            if (header.bubbleId && composerBubbles[header.bubbleId]) {
                bubbleOrderMap.set(header.bubbleId, index);
            }
        });
        
        sortedBubbles = Object.entries(composerBubbles)
            .map(([id, bubble]) => ({
                id,
                ...bubble,
                orderIndex: bubbleOrderMap.has(id) ? bubbleOrderMap.get(id) : 999999,
                timestamp: bubble.timestamp || bubble.createdAt || 0
            }))
            .sort((a, b) => {
                // Sort by conversation order first, then by timestamp as fallback
                if (a.orderIndex !== b.orderIndex) {
                    return a.orderIndex - b.orderIndex;
                }
                return a.timestamp - b.timestamp;
            });
    } else {
        // Fallback to timestamp sorting
        sortedBubbles = Object.entries(composerBubbles)
            .map(([id, bubble]) => ({
                id,
                ...bubble,
                timestamp: bubble.timestamp || bubble.createdAt || 0
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Group bubbles by usageUuid for assistant messages, but keep user messages separate
    const messageGroups = [];
    const usageUuidGroups = new Map();
    
    for (const bubble of sortedBubbles) {
        // Skip bubbles without meaningful conversation content
        if (!bubble.text && !bubble.thinking && !bubble.toolFormerData) continue;
        
        if (bubble.type === 1) {
            // User message - always create a new group
            messageGroups.push({
                type: 'user',
                bubbles: [bubble],
                timestamp: bubble.timestamp || bubble.createdAt || 0,
                usageUuid: bubble.usageUuid || null
            });
        } else {
            // Assistant message - group by usageUuid
            const usageUuid = bubble.usageUuid || `bubble-${bubble.id}`;
            
            if (!usageUuidGroups.has(usageUuid)) {
                const group = {
                    type: 'assistant',
                    bubbles: [],
                    timestamp: bubble.timestamp || bubble.createdAt || 0,
                    usageUuid: usageUuid
                };
                usageUuidGroups.set(usageUuid, group);
                messageGroups.push(group);
            }
            
            usageUuidGroups.get(usageUuid).bubbles.push(bubble);
        }
    }
    
    // Convert groups to messages
    // First, get the base timestamp for this conversation
    const baseTimestamp = getLatestTimestampForComposer(composerId, bubbles, composerData);
    const baseTime = baseTimestamp ? baseTimestamp.getTime() : Date.now();
    
    for (const group of messageGroups) {
        if (group.type === 'user') {
            // User message - simple case
            const bubble = group.bubbles[0];
            const parsed = parseMessageContent(bubble.text || '');
            
            // If bubble has no timestamp, estimate based on position and base time
            let messageTimestamp = bubble.timestamp || bubble.createdAt || 0;
            if (messageTimestamp === 0 && baseTimestamp) {
                // For follow-up messages, add small increments to base timestamp
                // This helps distinguish multiple user messages in the same conversation
                const userMessageIndex = messages.filter(m => m.type === 'user').length;
                messageTimestamp = baseTime + (userMessageIndex * 60000); // Add 1 minute per follow-up
            }
            
            messages.push({
                id: bubble.id,
                type: 'user',
                timestamp: messageTimestamp,
                content: parsed,
                raw_content: bubble.text || '',
                thinking_duration_ms: bubble.thinkingDurationMs || 0,
                usage_uuid: bubble.usageUuid
            });
        } else {
            // Assistant message - combine all bubbles in the group
            const combinedContent = {
                text: '',
                tool_calls: [],
                tool_results: [],
                thinking_blocks: [],
                code_blocks: [],
                file_operations: []
            };
            
            let mainBubbleId = null;
            let mainTimestamp = group.timestamp;
            let thinkingDurationMs = 0;
            
            // Process all bubbles in the group and find the latest timestamp
            for (const bubble of group.bubbles) {
                // Update main timestamp to the latest bubble timestamp
                const bubbleTimestamp = bubble.timestamp || bubble.createdAt || 0;
                if (bubbleTimestamp > mainTimestamp) {
                    mainTimestamp = bubbleTimestamp;
                }
                
                // Parse text content if available
                if (bubble.text) {
                    const parsed = parseMessageContent(bubble.text);
                    combinedContent.text += parsed.text;
                    combinedContent.tool_calls.push(...parsed.tool_calls);
                    combinedContent.tool_results.push(...parsed.tool_results);
                    combinedContent.thinking_blocks.push(...parsed.thinking_blocks);
                    combinedContent.code_blocks.push(...parsed.code_blocks);
                    combinedContent.file_operations.push(...parsed.file_operations);
                    
                    // Use the bubble with text as the main bubble
                    mainBubbleId = bubble.id;
                }
                
                // Add thinking content if available (including empty thinking bubbles)
                if (bubble.thinking) {
                    if (bubble.thinking.text && bubble.thinking.text.trim()) {
                        // Add actual thinking content
                        combinedContent.thinking_blocks.push(bubble.thinking.text.trim());
                    } else {
                        // Add placeholder for empty thinking bubble (indicates thinking occurred)
                        combinedContent.thinking_blocks.push('_[Assistant thinking...]_');
                    }
                }
                
                // Add tool calls if available
                if (bubble.toolFormerData) {
                    const toolData = bubble.toolFormerData;
                    let parameters = {};
                    try {
                        parameters = toolData.rawArgs ? JSON.parse(toolData.rawArgs) : {};
                    } catch (e) {
                        parameters = { rawArgs: toolData.rawArgs };
                    }
                    
                    // Better tool name detection
                    let toolName = toolData.name || toolData.tool;
                    
                    // If no tool name found, try to infer from other fields
                    if (!toolName || toolName === 'unknown_tool') {
                        if (toolData.rawArgs) {
                            const rawArgs = toolData.rawArgs;
                            if (rawArgs.includes('file_path') || rawArgs.includes('"path"')) {
                                if (rawArgs.includes('old_string') || rawArgs.includes('new_string')) {
                                    toolName = 'search_replace';
                                } else if (rawArgs.includes('content')) {
                                    toolName = 'write_file';
                                } else {
                                    toolName = 'read_file';
                                }
                            } else if (rawArgs.includes('command')) {
                                toolName = 'run_terminal_cmd';
                            } else if (rawArgs.includes('pattern') || rawArgs.includes('query')) {
                                toolName = 'grep_search';
                            } else if (rawArgs.includes('relative_workspace_path')) {
                                toolName = 'list_dir';
                            }
                        }
                        
                        // If still no tool name, use a generic one
                        if (!toolName) {
                            toolName = 'unknown_tool';
                        }
                    }
                    
                    combinedContent.tool_calls.push({
                        tool_name: toolName,
                        parameters: parameters,
                        status: toolData.status,
                        result: toolData.result,
                        raw_content: JSON.stringify(toolData, null, 2)
                    });
                }
                
                // Update timing info
                if (bubble.thinkingDurationMs) {
                    thinkingDurationMs += bubble.thinkingDurationMs;
                }
            }
            
            // If no valid timestamp found from bubbles, estimate based on position
            if (mainTimestamp === 0 && baseTimestamp) {
                const assistantMessageIndex = messages.filter(m => m.type === 'assistant').length;
                mainTimestamp = baseTime + (assistantMessageIndex * 30000); // Add 30 seconds per assistant message
            }
            
            // Clean up combined text
            combinedContent.text = combinedContent.text.trim();
            
            // Remove duplicates from arrays
            combinedContent.thinking_blocks = [...new Set(combinedContent.thinking_blocks)];
            
            messages.push({
                id: mainBubbleId || group.bubbles[0].id,
                type: 'assistant',
                timestamp: mainTimestamp,
                content: combinedContent,
                raw_content: combinedContent.text,
                thinking_duration_ms: thinkingDurationMs,
                usage_uuid: group.usageUuid
            });
        }
    }
    
    return {
        composer_id: composerId,
        composer_data: composerData,
        messages: messages,
        code_diffs: composerCodeDiffs,
        checkpoints: composerCheckpoints
    };
}

/**
 * Get the latest timestamp across all messages in a conversation
 */
function getLatestTimestampFromMessages(messages) {
    if (!messages || messages.length === 0) {
        return null;
    }
    
    let latestTimestamp = 0;
    let foundValidTimestamp = false;
    
    // Check all messages for the highest timestamp
    for (const message of messages) {
        if (message.timestamp && message.timestamp > 0) {
            if (message.timestamp > latestTimestamp) {
                latestTimestamp = message.timestamp;
                foundValidTimestamp = true;
            }
        }
    }
    
    return foundValidTimestamp ? new Date(latestTimestamp) : null;
}

/**
 * Get the latest timestamp for a composer from raw bubble data
 * This is useful for CLI ordering before conversations are fully reconstructed
 */
function getLatestTimestampForComposer(composerId, bubbles, composerData) {
    // Get all bubbles for this composer
    const composerBubbles = bubbles[composerId] || {};
    
    let latestTimestamp = 0;
    let foundValidTimestamp = false;
    
    // Check all bubbles for this composer
    for (const [bubbleId, bubble] of Object.entries(composerBubbles)) {
        // Try multiple timestamp fields that might exist
        const possibleTimestamps = [
            bubble.timestamp,
            bubble.createdAt,
            bubble.created_at,
            bubble.updatedAt,
            bubble.updated_at,
            bubble.lastModified,
            bubble.last_modified
        ];
        
        for (const timestamp of possibleTimestamps) {
            if (timestamp && timestamp > 0) {
                if (timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                    foundValidTimestamp = true;
                }
            }
        }
    }
    
    // If no bubble timestamps found, check composer data itself
    if (!foundValidTimestamp && composerData) {
        const composerTimestampFields = [
            'timestamp',
            'createdAt', 
            'created_at',
            'lastModified',
            'last_modified',
            'updatedAt',
            'updated_at',
            'lastUpdatedAt',
            'last_updated_at'
        ];
        
        for (const field of composerTimestampFields) {
            if (composerData[field] && composerData[field] > 0) {
                if (composerData[field] > latestTimestamp) {
                    latestTimestamp = composerData[field];
                    foundValidTimestamp = true;
                }
            }
        }
        
        // Also check if conversation array has bubbles with timestamps
        if (composerData.conversation && Array.isArray(composerData.conversation)) {
            for (const conversationBubble of composerData.conversation) {
                for (const field of composerTimestampFields) {
                    if (conversationBubble[field] && conversationBubble[field] > 0) {
                        if (conversationBubble[field] > latestTimestamp) {
                            latestTimestamp = conversationBubble[field];
                            foundValidTimestamp = true;
                        }
                    }
                }
            }
        }
    }
    
    return foundValidTimestamp ? new Date(latestTimestamp) : null;
}

/**
 * Get conversation summary for selection UI
 */
function getConversationSummary(conversation) {
    const title = conversation.composer_data?.name || 'Untitled Conversation';
    const messageCount = conversation.messages.length;
    const userMessages = conversation.messages.filter(m => m.type === 'user').length;
    const assistantMessages = conversation.messages.filter(m => m.type === 'assistant').length;
    
    // Get first user message for preview
    const firstUserMessage = conversation.messages.find(m => m.type === 'user');
    const preview = firstUserMessage ? 
        firstUserMessage.content.text.substring(0, 100).replace(/\n/g, ' ') + '...' : 
        'No messages';
    
    // Get the latest timestamp across ALL messages (handles follow-ups properly)
    let lastMessageTime = getLatestTimestampFromMessages(conversation.messages);
    
    // If no valid timestamps found in messages, try fallback approaches
    if (!lastMessageTime) {
        // Check if composer data has any timestamp information
        const composerData = conversation.composer_data;
        let fallbackTime = null;
        
        // Look for any timestamp-like fields in composer data
        if (composerData) {
            // Check common timestamp field names
            const timestampFields = ['timestamp', 'createdAt', 'created_at', 'lastModified', 'last_modified', 'updatedAt', 'updated_at', 'lastUpdatedAt', 'last_updated_at'];
            for (const field of timestampFields) {
                if (composerData[field] && composerData[field] > 0) {
                    fallbackTime = new Date(composerData[field]);
                    break;
                }
            }
            
            // Check if conversation array has any bubbles with timestamps
            if (!fallbackTime && composerData.conversation && Array.isArray(composerData.conversation)) {
                for (const bubble of composerData.conversation) {
                    for (const field of timestampFields) {
                        if (bubble[field] && bubble[field] > 0) {
                            fallbackTime = new Date(bubble[field]);
                            break;
                        }
                    }
                    if (fallbackTime) break;
                }
            }
        }
        
        if (fallbackTime && fallbackTime.getFullYear() > 2020) {
            lastMessageTime = fallbackTime;
        } else {
            // Final fallback: use recent times working backwards from now
            // Use message count and composer position to create realistic timestamps
            const now = new Date();
            const conversationIndex = conversation.messages.length || 1;
            const composerPosition = conversation.composer_id ? conversation.composer_id.slice(-8) : Math.random().toString(36);
            
            // Create a pseudo-random but consistent time offset based on composer ID
            const hashCode = composerPosition.split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);
            
            // More recent conversations (more messages) get newer timestamps
            const baseHoursAgo = Math.min(conversationIndex * 0.5, 48); // Max 2 days ago
            const randomOffset = Math.abs(hashCode % 24); // Random 0-24 hours
            const totalHoursAgo = baseHoursAgo + randomOffset;
            
            lastMessageTime = new Date(now.getTime() - (totalHoursAgo * 60 * 60 * 1000));
        }
    }
    
    return {
        id: conversation.composer_id,
        title,
        preview,
        messageCount,
        userMessages,
        assistantMessages,
        lastMessageTime,
        conversation
    };
}

module.exports = {
    reconstructConversation,
    getConversationSummary,
    getLatestTimestampForComposer,
    getLatestTimestampFromMessages
};