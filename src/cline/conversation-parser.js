/**
 * Parse Cline conversation data into a structured format similar to Cursor
 */

/**
 * Parse UI messages and API conversation into a structured conversation
 * @param {Object} taskData - Raw Cline task data
 * @returns {Object} Parsed conversation data
 */
function parseClineConversation(taskData) {
    const { uiMessages, apiConversation, taskMetadata, taskId, timestamp } = taskData;
    
    // Extract model information from task metadata
    const modelInfo = taskMetadata?.model_usage?.[0];
    const modelName = modelInfo?.model_id || 'Unknown Model';
    
    const conversation = {
        id: taskId,
        timestamp,
        title: extractConversationTitle(uiMessages),
        model: modelName,
        messages: [],
        metadata: taskMetadata,
        messageCount: 0
    };
    
    // Process UI messages to create a conversation flow
    const processedMessages = processUIMessages(uiMessages, apiConversation);
    conversation.messages = processedMessages;
    conversation.messageCount = processedMessages.length;
    
    return conversation;
}

/**
 * Extract conversation title from UI messages
 * @param {Array} uiMessages - Array of UI messages
 * @returns {string} Conversation title
 */
function extractConversationTitle(uiMessages) {
    // Find the first user text message
    const firstUserMessage = uiMessages.find(msg => msg.say === 'text' && msg.text);
    if (firstUserMessage) {
        return firstUserMessage.text.substring(0, 100).replace(/\n/g, ' ') + (firstUserMessage.text.length > 100 ? '...' : '');
    }
    
    return 'Cline Conversation';
}

/**
 * Process UI messages into structured conversation messages
 * @param {Array} uiMessages - Array of UI messages
 * @param {Array} apiConversation - Array of API conversation messages
 * @returns {Array} Processed messages
 */
function processUIMessages(uiMessages, apiConversation) {
    const messages = [];
    let currentMessage = null;
    
    for (const uiMsg of uiMessages) {
        switch (uiMsg.say) {
            case 'text':
                // User message
                if (currentMessage && currentMessage.role === 'assistant') {
                    messages.push(currentMessage);
                    currentMessage = null;
                }
                
                messages.push({
                    role: 'user',
                    content: uiMsg.text,
                    timestamp: uiMsg.ts,
                    images: uiMsg.images || [],
                    files: uiMsg.files || []
                });
                break;
                
            case 'api_req_started':
                // Start of assistant response
                if (currentMessage && currentMessage.role === 'assistant') {
                    messages.push(currentMessage);
                }
                
                currentMessage = {
                    role: 'assistant',
                    content: '',
                    timestamp: uiMsg.ts,
                    toolCalls: [],
                    thinking: '',
                    apiInfo: uiMsg.text ? JSON.parse(uiMsg.text) : {}
                };
                break;
                
            case 'reasoning':
                // Assistant thinking/reasoning
                if (currentMessage && currentMessage.role === 'assistant') {
                    currentMessage.thinking += uiMsg.text || '';
                    if (uiMsg.partial) {
                        // This is partial thinking content
                        continue;
                    }
                }
                break;
                
            case 'tool':
                // Tool usage
                if (currentMessage && currentMessage.role === 'assistant') {
                    try {
                        const toolData = JSON.parse(uiMsg.text);
                        currentMessage.toolCalls.push({
                            name: toolData.tool,
                            input: toolData,
                            timestamp: uiMsg.ts,
                            result: toolData.content || ''
                        });
                    } catch (e) {
                        // If parsing fails, add as raw text
                        currentMessage.content += `\n\n📋 Tool: ${uiMsg.text}\n`;
                    }
                }
                break;
                
            case 'checkpoint_created':
                // Checkpoint creation - could be used for conversation boundaries
                if (currentMessage) {
                    currentMessage.checkpoint = {
                        hash: uiMsg.lastCheckpointHash,
                        isCheckedOut: uiMsg.isCheckpointCheckedOut
                    };
                }
                break;
                
            default:
                // Other message types - add as content if we have an active message
                if (currentMessage && uiMsg.text) {
                    currentMessage.content += `\n${uiMsg.text}`;
                }
                break;
        }
    }
    
    // Add the last message if it exists
    if (currentMessage) {
        messages.push(currentMessage);
    }
    
    // Enhance with API conversation data if available
    enhanceWithApiData(messages, apiConversation);
    
    return messages;
}

/**
 * Enhance processed messages with API conversation data
 * @param {Array} messages - Processed messages
 * @param {Array} apiConversation - API conversation data
 */
function enhanceWithApiData(messages, apiConversation) {
    // Map API conversation to UI messages based on timestamps or content
    for (const apiMsg of apiConversation) {
        if (apiMsg.role === 'assistant' && apiMsg.content) {
            // Find corresponding assistant message
            const assistantMsg = messages.find(msg => 
                msg.role === 'assistant' && 
                Math.abs(msg.timestamp - (apiMsg.timestamp || 0)) < 5000 // Within 5 seconds
            );
            
            if (assistantMsg && Array.isArray(apiMsg.content)) {
                // Process content array
                for (const content of apiMsg.content) {
                    if (content.type === 'text') {
                        assistantMsg.content += content.text;
                    } else if (content.type === 'tool_use') {
                        // Add tool use information
                        assistantMsg.toolCalls.push({
                            name: content.name,
                            input: content.input,
                            id: content.id
                        });
                    }
                }
            }
        }
    }
}

/**
 * Format tool call for markdown output
 * @param {Object} toolCall - Tool call object
 * @returns {string} Formatted tool call
 */
function formatToolCall(toolCall) {
    const toolName = toolCall.name || 'Unknown Tool';
    const toolInput = toolCall.input || {};
    
    let formattedCall = `\n📋 **${toolName}**\n`;
    
    if (toolInput.path) {
        formattedCall += `Path: \`${toolInput.path}\`\n`;
    }
    
    if (toolInput.content && toolInput.content.length < 500) {
        formattedCall += `\n\`\`\`\n${toolInput.content}\n\`\`\`\n`;
    } else if (toolCall.result && toolCall.result.length < 500) {
        formattedCall += `\n\`\`\`\n${toolCall.result}\n\`\`\`\n`;
    }
    
    return formattedCall;
}

/**
 * Get conversation summary for display
 * @param {Object} conversation - Parsed conversation
 * @returns {Object} Conversation summary
 */
function getConversationSummary(conversation) {
    const userMessages = conversation.messages.filter(msg => msg.role === 'user').length;
    const assistantMessages = conversation.messages.filter(msg => msg.role === 'assistant').length;
    const totalToolCalls = conversation.messages.reduce((count, msg) => 
        count + (msg.toolCalls ? msg.toolCalls.length : 0), 0);
    
    return {
        id: conversation.id,
        title: conversation.title,
        timestamp: conversation.timestamp,
        messageCount: conversation.messageCount,
        userMessages,
        assistantMessages,
        toolCalls: totalToolCalls,
        duration: calculateConversationDuration(conversation)
    };
}

/**
 * Calculate conversation duration
 * @param {Object} conversation - Parsed conversation
 * @returns {number} Duration in milliseconds
 */
function calculateConversationDuration(conversation) {
    if (conversation.messages.length < 2) return 0;
    
    const firstTimestamp = conversation.messages[0].timestamp;
    const lastTimestamp = conversation.messages[conversation.messages.length - 1].timestamp;
    
    return lastTimestamp - firstTimestamp;
}

module.exports = {
    parseClineConversation,
    extractConversationTitle,
    formatToolCall,
    getConversationSummary,
    calculateConversationDuration
};