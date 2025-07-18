const { extractCursorDiskKV } = require('./extractor');
const { reconstructConversation, getConversationSummary } = require('./conversation-parser');

/**
 * Get recent conversations from Cursor data
 */
async function getRecentConversations(limit = 10) {
    console.log('Extracting Cursor data...');
    const extractedData = await extractCursorDiskKV();
    
    if (!extractedData.composers || Object.keys(extractedData.composers).length === 0) {
        console.log('No conversations found');
        return [];
    }
    
    console.log(`Found ${Object.keys(extractedData.composers).length} composers`);
    
    // Reconstruct all conversations
    const conversations = [];
    
    for (const [composerId, composerData] of Object.entries(extractedData.composers)) {
        const conversation = reconstructConversation(
            composerId,
            extractedData.bubbles,
            extractedData.checkpoints,
            extractedData.codeDiffs,
            composerData
        );
        
        // Only include conversations with messages
        if (conversation.messages.length > 0) {
            conversations.push(conversation);
        }
    }
    
    // Generate summaries first to get proper timestamps
    const conversationsWithSummaries = conversations.map(getConversationSummary);
    
    // Sort by last message time (most recent first) using the summary timestamps
    conversationsWithSummaries.sort((a, b) => {
        return b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
    });
    
    // Limit to requested number
    const recentConversations = conversationsWithSummaries.slice(0, limit);
    return recentConversations;
}

/**
 * Format conversation for CLI display
 */
function formatConversationForCLI(conversation, index) {
    const timeAgo = getTimeAgo(conversation.lastMessageTime);
    const title = conversation.title.length > 50 
        ? conversation.title.substring(0, 47) + '...' 
        : conversation.title;
    
    const preview = conversation.preview.length > 80
        ? conversation.preview.substring(0, 77) + '...'
        : conversation.preview;
    
    return `${index + 1}. ${title}
   📅 ${timeAgo} • 💬 ${conversation.messageCount} messages
   📝 ${preview}`;
}

/**
 * Format conversation for VSCode QuickPick
 */
function formatConversationForVSCode(conversation, index) {
    const timeAgo = getTimeAgo(conversation.lastMessageTime);
    
    return {
        label: conversation.title,
        description: `${timeAgo} • ${conversation.messageCount} messages`,
        detail: conversation.preview,
        conversation: conversation.conversation
    };
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) {
        return 'just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else if (diffDays === 1) {
        return 'yesterday';
    } else if (diffDays < 7) {
        return `${diffDays}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}

/**
 * Select conversation by index
 */
function selectConversationByIndex(conversations, index) {
    if (index < 0 || index >= conversations.length) {
        return null;
    }
    return conversations[index];
}

module.exports = {
    getRecentConversations,
    formatConversationForCLI,
    formatConversationForVSCode,
    selectConversationByIndex
};