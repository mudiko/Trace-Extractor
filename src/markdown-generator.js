/**
 * Enhanced Markdown Generator for Cursor Conversations
 * Handles complex conversation structures with tool calls, thinking blocks, and code
 */

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
                
                // Add details about the edit
                if (params.old_string && params.new_string) {
                    const oldLines = params.old_string.split('\n');
                    const newLines = params.new_string.split('\n');
                    
                    const totalOldLength = params.old_string.length;
                    const totalNewLength = params.new_string.length;
                    
                    if (oldLines.length <= 4 && newLines.length <= 5 && totalOldLength <= 150 && totalNewLength <= 200) {
                        editDesc += ` (Replace: "${params.old_string}" → "${params.new_string}")`;
                    } else {
                        const oldSummary = oldLines.length > 1 
                            ? `${oldLines[0]}...${oldLines[oldLines.length - 1]}`
                            : oldLines[0];
                        const newSummary = newLines.length > 1
                            ? `${newLines[0]}...${newLines[newLines.length - 1]}`
                            : newLines[0];
                        
                        const oldPreview = oldSummary.length > 60 ? 
                            oldSummary.substring(0, 57) + '...' : oldSummary;
                        const newPreview = newSummary.length > 60 ? 
                            newSummary.substring(0, 57) + '...' : newSummary;
                        
                        editDesc += ` (Replace: "${oldPreview}" → "${newPreview}")`;
                    }
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
                const cmdPreview = params.command.length > 60 ? 
                    params.command.substring(0, 57) + '...' : params.command;
                cmdDesc = `Run command: \`${cmdPreview}\``;
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
                const queryPreview = query.length > 40 ? query.substring(0, 37) + '...' : query;
                searchDesc = `Search: \`${queryPreview}\``;
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
            // Generic handling for unknown tools
            let desc = toolName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    
    // Filter out duplicates and process thinking content
    const uniqueThinking = [...new Set(thinkingBlocks)];
    
    let formattedThinking = '';
    
    for (const thinking of uniqueThinking) {
        if (thinking.trim() === '_[Assistant thinking...]_') {
            // Handle placeholder thinking indicators
            formattedThinking += '*[Assistant thinking...]*\n\n';
        } else if (thinking.trim()) {
            // Handle actual thinking content
            formattedThinking += `<details>\n<summary>🤔 Thinking</summary>\n\n${thinking.trim()}\n\n</details>\n\n`;
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
        markdown += `**Conversation ID:** \`${conversation.composer_id.substring(0, 8)}\`  \n`;
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
                    if (toolAction) {
                        markdown += `📋 ${toolAction}\n\n`;
                        
                        // Add formatted result if it's an LS command
                        if (toolCall.tool_name && toolCall.tool_name.toLowerCase() === 'codebase_search' && toolCall.result) {
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
    
    return `${safeTitle}_${conversation.composer_id.substring(0, 8)}.md`;
}

module.exports = {
    generateMarkdownConversation,
    generateConversationFilename
};