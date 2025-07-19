/**
 * Enhanced Markdown Generator for Cursor Conversations
 * Handles complex conversation structures with tool calls, thinking blocks, and code
 */

/**
 * Format code diffs in SpecStory style
 */
function formatCodeDiff(oldString, newString) {
    if (!oldString || !newString) return null;
    
    const oldLines = oldString.split('\n');
    const newLines = newString.split('\n');
    
    // Create a clean diff block with separators
    let diffBlock = '---\n```diff\n';
    
    // For simple single-line changes
    if (oldLines.length === 1 && newLines.length === 1) {
        diffBlock += `- ${oldLines[0]}\n`;
        diffBlock += `+ ${newLines[0]}\n`;
    } else {
        // For multi-line changes, show context
        const maxLines = Math.max(oldLines.length, newLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            if (i < oldLines.length) {
                diffBlock += `- ${oldLines[i]}\n`;
            }
            if (i < newLines.length) {
                diffBlock += `+ ${newLines[i]}\n`;
            }
        }
    }
    
    diffBlock += '```\n---';
    return diffBlock;
}

/**
 * Format tool call with detailed parameters and results
 */
function formatToolCallAction(toolCall) {
    const toolName = toolCall.tool_name;
    const params = toolCall.parameters || {};
    
    // Create detailed descriptions based on tool type and parameters
    switch (toolName.toLowerCase()) {
        case 'read':
        case 'read_file':
            let readDesc = 'Read file';
            if (params.target_file || params.file_path || params.path) {
                const filePath = params.target_file || params.file_path || params.path;
                const fileName = filePath.split('/').pop();
                readDesc = `Read file: \`${fileName}\``;
                if (params.explanation) {
                    readDesc += ` - ${params.explanation}`;
                }
            }
            return readDesc;
            
        case 'write':
        case 'write_file':
            let writeDesc = 'Write file';
            if (params.file_path || params.path || params.target_file) {
                const filePath = params.file_path || params.path || params.target_file;
                const fileName = filePath.split('/').pop();
                writeDesc = `Write file: \`${fileName}\``;
                if (params.explanation) {
                    writeDesc += ` - ${params.explanation}`;
                }
            }
            return writeDesc;
            
        case 'edit':
        case 'edit_file':
        case 'multiedit':
        case 'search_replace':
            let editDesc = 'Edit file';
            if (params.file_path || params.path || params.target_file) {
                const filePath = params.file_path || params.path || params.target_file;
                const fileName = filePath.split('/').pop();
                editDesc = `Edit file: \`${fileName}\``;
                
                // Add diff details - no truncation, clean formatting
                if (params.old_string && params.new_string) {
                    // Store the diff for later display after the tool description
                    editDesc += '\n\n' + formatCodeDiff(params.old_string, params.new_string);
                }
                
                if (params.explanation) {
                    editDesc += ` - ${params.explanation}`;
                }
            }
            return editDesc;
            
        case 'ls':
        case 'list_directory':
        case 'list_dir':
            let listDesc = 'List directory';
            if (params.path || params.relative_workspace_path) {
                const dirPath = params.path || params.relative_workspace_path;
                const dirName = dirPath.split('/').pop() || dirPath;
                listDesc = `List directory: \`${dirName}\``;
                if (params.explanation) {
                    listDesc += ` - ${params.explanation}`;
                }
            }
            return listDesc;
            
        case 'bash':
        case 'run_terminal_cmd':
        case 'terminal':
            let cmdDesc = 'Run command';
            if (params.command) {
                cmdDesc = `Run command: \`${params.command}\``;
                if (params.explanation) {
                    cmdDesc += ` - ${params.explanation}`;
                }
            }
            return cmdDesc;
            
        case 'codebase_search':
        case 'search':
        case 'grep':
        case 'grep_search':
            let searchDesc = 'Search';
            if (params.query || params.pattern) {
                const query = params.query || params.pattern;
                searchDesc = `Search: \`${query}\``;
                if (params.include_pattern) {
                    searchDesc += ` in \`${params.include_pattern}\``;
                }
                if (params.explanation) {
                    searchDesc += ` - ${params.explanation}`;
                }
            }
            return searchDesc;
            
        case 'glob':
        case 'file_search':
            let globDesc = 'Find files';
            if (params.pattern || params.query) {
                const pattern = params.pattern || params.query;
                globDesc = `Find files: \`${pattern}\``;
                if (params.explanation) {
                    globDesc += ` - ${params.explanation}`;
                }
            }
            return globDesc;
            
        case 'task':
            if (params.description) {
                return `Task: ${params.description}`;
            }
            return `Execute task`;
            
        case 'webfetch':
            if (params.url) {
                return `Fetch: ${params.url}`;
            }
            return `Web fetch`;
            
        default:
            // Generic handling for unknown tools - ensure we always return meaningful text
            let desc = toolName || 'Unknown Tool';  // Fallback in case toolName is empty
            if (desc !== 'Unknown Tool') {
                desc = toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            
            // For unknown tools, provide more helpful information
            if (toolName === 'unknown_tool' || !toolName) {
                desc = 'Unknown Tool';
                
                // Try to extract meaningful info from raw_content if available
                if (toolCall.raw_content) {
                    try {
                        const rawData = JSON.parse(toolCall.raw_content);
                        if (rawData.additionalData?.status === 'error') {
                            desc += ' (execution failed)';
                        } else if (rawData.status) {
                            desc += ` (${rawData.status})`;
                        }
                    } catch (e) {
                        // If parsing fails, check for any useful raw content
                        if (toolCall.raw_content.includes('error')) {
                            desc += ' (error)';
                        }
                    }
                } else if (toolCall.status) {
                    desc += ` (${toolCall.status})`;
                } else {
                    desc += ' (no data available)';
                }
                
                // Show timing info if available
                if (toolCall.timestamp) {
                    desc += ` at ${new Date(toolCall.timestamp).toLocaleTimeString()}`;
                }
            }
            
            if (params.explanation) {
                desc += ` - ${params.explanation}`;
            }
            return desc;
    }
}

/**
 * Format thinking blocks for markdown display
 */
function formatThinkingBlocks(thinkingBlocks) {
    if (!thinkingBlocks || thinkingBlocks.length === 0) return '';
    
    // Process all thinking content without filtering
    let formattedThinking = '';
    
    for (const thinking of thinkingBlocks) {
        if (thinking && thinking.trim()) {
            // Show all thinking content in collapsible details wrapped in think tags
            formattedThinking += `<think>\n<details>\n<summary>🤔 Thinking</summary>\n\n${thinking.trim()}\n\n</details>\n</think>\n\n`;
        }
    }
    
    return formattedThinking.trim();
}

/**
 * Format LS (directory listing) results as collapsible table with emojis
 */
function formatLSResult(result, toolCall) {
    if (!result || typeof result !== 'string') return null;
    
    // Extract file/directory information from LS result
    const lines = result.split('\n').filter(line => line.trim());
    
    // Try to detect if this is a structured LS output
    const items = [];
    let directoryName = 'directory';
    
    // Look for common LS patterns
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Handle various LS output formats
        if (trimmed.startsWith('- ') && trimmed.includes('/')) {
            // Format: "- /path/to/item/"
            const itemName = trimmed.substring(2).split('/').pop();
            const isDir = trimmed.endsWith('/');
            items.push({ name: itemName, isDirectory: isDir });
        } else if (trimmed.includes('📁') || trimmed.includes('📄')) {
            // Already formatted, skip
            continue;
        } else if (trimmed.match(/^\w+/)) {
            // Simple filename/dirname
            const isDir = !trimmed.includes('.');
            items.push({ name: trimmed, isDirectory: isDir });
        }
    }
    
    // If we couldn't parse items, try a simpler approach
    if (items.length === 0 && lines.length > 0) {
        // Get directory name from tool call parameters
        if (toolCall?.parameters?.path) {
            directoryName = toolCall.parameters.path.split('/').pop() || 'directory';
        }
        
        // Assume each line is a file/directory
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('Listed') && !trimmed.includes('paths')) {
                const isDir = !trimmed.includes('.') || trimmed.endsWith('/');
                const name = trimmed.replace(/\/$/, '');
                items.push({ name, isDirectory: isDir });
            }
        }
    }
    
    if (items.length === 0) return null;
    
    // Get directory name from parameters
    if (toolCall?.parameters?.path) {
        directoryName = toolCall.parameters.path === '.' ? 'current directory' : toolCall.parameters.path;
    }
    
    let formatted = `<details>\n`;
    formatted += `            <summary>Listed ${directoryName} • **${items.length}** results</summary>\n`;
    formatted += `        \n`;
    formatted += `| Name |\n`;
    formatted += `|-------|\n`;
    
    for (const item of items) {
        const emoji = item.isDirectory ? '📁' : '📄';
        formatted += `| ${emoji} \`${item.name}\` |\n`;
    }
    
    formatted += `\n</details>`;
    
    return formatted;
}

/**
 * Generate markdown for a conversation in enhanced format
 */
function generateMarkdownConversation(conversation) {
    const title = conversation.composer_data?.name || 'Untitled Conversation';
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    
    let markdown = `<!-- Generated by Trace Extractor -->\n\n`;
    markdown += `# ${title}\n\n`;
    markdown += `**Generated:** ${timestamp}  \n`;
    markdown += `**Messages:** ${conversation.messages.length}  \n`;
    
    // Add conversation metadata
    if (conversation.composer_data?.name) {
        markdown += `**Conversation ID:** \`${conversation.composer_id}\`  \n`;
    }
    
    // Add request ID (show only the most recent one, which is what's visible in Cursor UI)
    if (conversation.request_ids && conversation.request_ids.length > 0) {
        const mostRecentRequestId = conversation.request_ids[conversation.request_ids.length - 1];
        markdown += `**Request ID:** \`${mostRecentRequestId}\`  \n`;
    }
    
    markdown += `\n---\n\n`;
    
    for (let i = 0; i < conversation.messages.length; i++) {
        const message = conversation.messages[i];
        const isUser = message.type === 'user';
        
        // Add message header
        if (isUser) {
            markdown += `## 👤 User\n\n`;
        } else {
            markdown += `## 🤖 Assistant\n\n`;
        }
        
        if (isUser) {
            // For user messages, just show the text
            let userText = message.content.text;
            // Clean up any function calls that might be in user messages
            userText = userText.replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/g, '');
            userText = userText.replace(/<function_results>[\s\S]*?<\/antml:function_calls>/g, '');
            userText = userText.trim();
            
            markdown += `${userText}\n\n`;
        } else {
            // For assistant messages, show thinking first if available
            if (message.content.thinking_blocks.length > 0) {
                const formattedThinking = formatThinkingBlocks(message.content.thinking_blocks);
                markdown += `${formattedThinking}\n\n`;
            }
            
            // Show tool calls in a simple format
            if (message.content.tool_calls.length > 0) {
                for (const toolCall of message.content.tool_calls) {
                    let toolAction = formatToolCallAction(toolCall);
                    
                    // Ensure we always have meaningful text - never show just the emoji
                    if (!toolAction || toolAction.trim() === '') {
                        toolAction = toolCall.tool_name ? 
                            toolCall.tool_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
                            'Tool execution';
                    }
                    
                    markdown += `📋 ${toolAction}\n\n`;
                    
                    // Add tool results if available
                    if (toolCall.result) {
                        let resultDisplay = '';
                        
                        // Handle different result types
                        try {
                            // Try to parse as JSON first
                            const result = JSON.parse(toolCall.result);
                            
                            // Special handling for different tool types
                            if (toolCall.tool_name === 'run_terminal_cmd') {
                                // Show command output
                                if (result.contents || result.output) {
                                    const output = result.contents || result.output;
                                    resultDisplay = `<details>\n<summary>📤 Command Output</summary>\n\n\`\`\`\n${output}\n\`\`\`\n\n</details>`;
                                } else if (result.error) {
                                    resultDisplay = `<details>\n<summary>❌ Command Error</summary>\n\n\`\`\`\n${result.error}\n\`\`\`\n\n</details>`;
                                }
                            } else if (toolCall.tool_name === 'read_file') {
                                // Show file content preview
                                if (result.contents) {
                                    const preview = result.contents.length > 500 ? 
                                        result.contents.substring(0, 497) + '...' : result.contents;
                                    resultDisplay = `<details>\n<summary>📄 File Content (${result.contents.length} chars)</summary>\n\n\`\`\`\n${preview}\n\`\`\`\n\n</details>`;
                                }
                            } else if (toolCall.tool_name === 'list_dir') {
                                // Use existing LS formatting
                                const formattedResult = formatLSResult(toolCall.result, toolCall);
                                if (formattedResult) {
                                    resultDisplay = formattedResult;
                                }
                            } else if (toolCall.tool_name === 'codebase_search') {
                                // Use existing codebase search formatting
                                if (result.codeResults && result.codeResults.length > 0) {
                                    const formattedResult = formatLSResult(toolCall.result, toolCall);
                                    if (formattedResult) {
                                        resultDisplay = formattedResult;
                                    }
                                }
                            } else if (toolCall.tool_name === 'grep_search') {
                                // Show search results
                                if (result.matches || result.results) {
                                    const matches = result.matches || result.results;
                                    resultDisplay = `<details>\n<summary>🔍 Search Results (${matches.length} matches)</summary>\n\n\`\`\`\n${matches.slice(0, 10).join('\n')}\n\`\`\`\n\n</details>`;
                                }
                            } else {
                                // Generic result display for other tools
                                const resultStr = JSON.stringify(result, null, 2);
                                if (resultStr.length > 50) {
                                    resultDisplay = `<details>\n<summary>📋 Result</summary>\n\n\`\`\`json\n${resultStr}\n\`\`\`\n\n</details>`;
                                }
                            }
                        } catch (e) {
                            // If not JSON, treat as plain text result
                            const plainResult = String(toolCall.result);
                            if (plainResult.trim() && plainResult.length > 10) {
                                if (toolCall.tool_name === 'run_terminal_cmd') {
                                    resultDisplay = `<details>\n<summary>📤 Command Output</summary>\n\n\`\`\`\n${plainResult}\n\`\`\`\n\n</details>`;
                                } else {
                                    resultDisplay = `<details>\n<summary>📋 Result</summary>\n\n\`\`\`\n${plainResult}\n\`\`\`\n\n</details>`;
                                }
                            }
                        }
                        
                        if (resultDisplay) {
                            markdown += `${resultDisplay}\n\n`;
                        }
                    }
                    
                    // Legacy: Add formatted result if it's an LS command (kept for compatibility)
                    else if (toolCall.tool_name && toolCall.tool_name.toLowerCase() === 'codebase_search' && toolCall.result) {
                        try {
                            const result = JSON.parse(toolCall.result);
                            if (result.codeResults && result.codeResults.length > 0) {
                                const formattedResult = formatLSResult(toolCall.result, toolCall);
                                if (formattedResult) {
                                    markdown += `${formattedResult}\n\n`;
                                }
                            }
                        } catch (e) {
                            // If it's not JSON, skip formatting
                        }
                    }
                }
            }
            
            // Show the main response text (without tool calls, results, and thinking)
            let cleanText = message.content.text;
            
            // Remove function calls
            cleanText = cleanText.replace(/<function_calls>[\s\S]*?<\/antml:function_calls>/g, '');
            
            // Remove function results
            cleanText = cleanText.replace(/<function_results>[\s\S]*?<\/antml:function_results>/g, '');
            
            // Remove thinking blocks
            cleanText = cleanText.replace(/<thinking>[\s\S]*?<\/antml:thinking>/g, '');
            
            // Clean up extra whitespace and multiple newlines
            cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();
            
            if (cleanText) {
                markdown += `${cleanText}\n\n`;
            }
        }
        
        // Add separator between messages (except for last message)
        if (i < conversation.messages.length - 1) {
            markdown += `---\n\n`;
        }
    }
    
    return markdown;
}

/**
 * Generate filename for conversation
 */
function generateConversationFilename(conversation) {
    const safeTitle = (conversation.composer_data?.name || 'untitled')
        .replace(/[^\w\s-]/g, '')
        .replace(/[-\s]+/g, '-')
        .substring(0, 50)
        .toLowerCase();
    
    return `${safeTitle}_${conversation.composer_id}.md`;
}

module.exports = {
    generateMarkdownConversation,
    generateConversationFilename
};