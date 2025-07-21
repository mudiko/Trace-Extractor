/**
 * Generate markdown for Cline conversations in a similar style to Cursor
 */

/**
 * Convert a Cline conversation to markdown format
 * @param {Object} conversation - Parsed Cline conversation
 * @returns {string} Markdown representation
 */
function conversationToMarkdown(conversation) {
    const { id, title, timestamp, messages, metadata, model } = conversation;
    
    let markdown = '';
    
    // Header
    markdown += `# ${title}\n\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n`;
    markdown += `**Messages:** ${conversation.messageCount}\n`;
    markdown += `**Task ID:** ${id}\n`;
    
    if (model) {
        markdown += `**Model:** ${model}\n`;
    }
    
    if (timestamp) {
        markdown += `**Started:** ${new Date(timestamp).toISOString()}\n`;
    }
    
    if (metadata && Object.keys(metadata).length > 0) {
        markdown += `**Model Usage:** ${metadata.model_usage?.length || 0} requests\n`;
        markdown += `**Files in Context:** ${metadata.files_in_context?.length || 0} files\n`;
    }
    
    markdown += '\n---\n\n';
    
    // Messages
    for (const message of messages) {
        markdown += formatMessage(message);
        markdown += '\n---\n\n';
    }
    
    return markdown;
}

/**
 * Format a single message for markdown
 * @param {Object} message - Message object
 * @returns {string} Formatted message
 */
function formatMessage(message) {
    let formatted = '';
    
    if (message.role === 'user') {
        formatted += '## 👤 User\n\n';
        formatted += message.content;
        
        // Add images if present
        if (message.images && message.images.length > 0) {
            formatted += '\n\n**Images:**\n';
            for (const image of message.images) {
                formatted += `- ${image}\n`;
            }
        }
        
        // Add files if present
        if (message.files && message.files.length > 0) {
            formatted += '\n\n**Files:**\n';
            for (const file of message.files) {
                formatted += `- ${file}\n`;
            }
        }
    } else if (message.role === 'assistant') {
        formatted += '## 🤖 Assistant\n\n';
        
        // Add thinking block if present
        if (message.thinking && message.thinking.trim()) {
            formatted += '<think>\n';
            formatted += '<details>\n';
            formatted += '<summary>🤔 Thinking</summary>\n\n';
            formatted += message.thinking.trim();
            formatted += '\n\n</details>\n';
            formatted += '</think>\n\n';
        }
        
        // Add tool calls
        if (message.toolCalls && message.toolCalls.length > 0) {
            for (const toolCall of message.toolCalls) {
                formatted += formatToolCall(toolCall);
                formatted += '\n';
            }
        }
        
        // Add main content
        if (message.content && message.content.trim()) {
            formatted += message.content.trim();
        }
        
        // Add checkpoint info if present
        if (message.checkpoint) {
            formatted += `\n\n*Checkpoint: ${message.checkpoint.hash?.substring(0, 8)}*`;
        }
        
        // Add API info if present
        if (message.apiInfo && message.apiInfo.cost) {
            formatted += `\n\n*Cost: $${message.apiInfo.cost} | Tokens: ${message.apiInfo.tokensIn}→${message.apiInfo.tokensOut}*`;
        }
    }
    
    return formatted;
}

/**
 * Format a tool call for markdown
 * @param {Object} toolCall - Tool call object
 * @returns {string} Formatted tool call
 */
function formatToolCall(toolCall) {
    const toolName = toolCall.name || 'Unknown Tool';
    let formatted = '';
    
    // Tool header with emoji mapping
    const toolEmojis = {
        'readFile': '📖',
        'writeFile': '✏️',
        'listFilesRecursive': '📁',
        'listFiles': '📂',
        'searchFiles': '🔍',
        'executeCommand': '⚡',
        'createFile': '📄',
        'editFile': '✏️',
        'default': '🔧'
    };
    
    const emoji = toolEmojis[toolName] || toolEmojis.default;
    formatted += `${emoji} **${getToolDisplayName(toolName)}**\n`;
    
    // Add tool details
    if (toolCall.input) {
        const input = typeof toolCall.input === 'string' ? toolCall.input : toolCall.input;
        
        // Special handling for different tool types
        if (toolName === 'readFile' || toolName === 'writeFile' || toolName === 'editFile') {
            const path = input.path || extractPathFromInput(input);
            if (path) {
                formatted += `File: \`${path}\`\n`;
            }
        } else if (toolName === 'listFilesRecursive' || toolName === 'listFiles') {
            const path = input.path || extractPathFromInput(input);
            if (path) {
                formatted += `Directory: \`${path}\`\n`;
            }
        } else if (toolName === 'executeCommand') {
            const command = input.command || extractCommandFromInput(input);
            if (command) {
                formatted += `Command: \`${command}\`\n`;
            }
        }
        
        // Show content for file operations (truncated)
        if (toolCall.result && toolCall.result.length > 0) {
            const content = toolCall.result;
            if (content.length < 1000) {
                formatted += `\n\`\`\`\n${content}\n\`\`\`\n`;
            } else {
                // Show truncated content
                formatted += `\n\`\`\`\n${content.substring(0, 500)}...\n[Content truncated]\n\`\`\`\n`;
            }
        } else if (typeof input === 'object' && input.content) {
            if (input.content.length < 1000) {
                formatted += `\n\`\`\`\n${input.content}\n\`\`\`\n`;
            } else {
                formatted += `\n\`\`\`\n${input.content.substring(0, 500)}...\n[Content truncated]\n\`\`\`\n`;
            }
        }
    }
    
    return formatted;
}

/**
 * Get display name for tool
 * @param {string} toolName - Internal tool name
 * @returns {string} Display name
 */
function getToolDisplayName(toolName) {
    const displayNames = {
        'readFile': 'Read File',
        'writeFile': 'Write File',
        'listFilesRecursive': 'List Files (Recursive)',
        'listFiles': 'List Files',
        'searchFiles': 'Search Files',
        'executeCommand': 'Execute Command',
        'createFile': 'Create File',
        'editFile': 'Edit File'
    };
    
    return displayNames[toolName] || toolName;
}

/**
 * Extract path from tool input
 * @param {*} input - Tool input
 * @returns {string|null} Extracted path
 */
function extractPathFromInput(input) {
    if (typeof input === 'string') {
        // Try to find path-like patterns
        const pathMatch = input.match(/path["']?\s*:\s*["']([^"']+)["']/);
        return pathMatch ? pathMatch[1] : null;
    }
    return input.path || null;
}

/**
 * Extract command from tool input
 * @param {*} input - Tool input
 * @returns {string|null} Extracted command
 */
function extractCommandFromInput(input) {
    if (typeof input === 'string') {
        const commandMatch = input.match(/command["']?\s*:\s*["']([^"']+)["']/);
        return commandMatch ? commandMatch[1] : null;
    }
    return input.command || null;
}

/**
 * Generate a summary of the conversation in markdown
 * @param {Object} conversation - Parsed conversation
 * @returns {string} Summary markdown
 */
function generateConversationSummary(conversation) {
    const summary = [];
    const userMessages = conversation.messages.filter(msg => msg.role === 'user');
    const assistantMessages = conversation.messages.filter(msg => msg.role === 'assistant');
    const totalToolCalls = assistantMessages.reduce((count, msg) => 
        count + (msg.toolCalls ? msg.toolCalls.length : 0), 0);
    
    summary.push(`**Conversation Summary for ${conversation.id}**`);
    summary.push(`- **Title:** ${conversation.title}`);
    summary.push(`- **Messages:** ${userMessages.length} user, ${assistantMessages.length} assistant`);
    summary.push(`- **Tool Calls:** ${totalToolCalls}`);
    
    if (conversation.metadata && conversation.metadata.model_usage) {
        const totalCost = conversation.metadata.model_usage.reduce((sum, usage) => sum + (usage.cost || 0), 0);
        summary.push(`- **Total Cost:** $${totalCost.toFixed(6)}`);
    }
    
    return summary.join('\n');
}

module.exports = {
    conversationToMarkdown,
    formatMessage,
    formatToolCall,
    generateConversationSummary
};