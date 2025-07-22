const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const { 
    getRecentConversations, 
    formatConversationForVSCode, 
    selectConversationByIndex 
} = require('./chat-selector.js');
const { 
    generateMarkdownConversation, 
    generateConversationFilename 
} = require('./markdown-generator.js');
const { getRecentClineConversations, extractClineTask, getExtensionFriendlyName } = require('./cline/extractor.js');
const { parseClineConversation } = require('./cline/conversation-parser.js');
const { conversationToMarkdown } = require('./cline/markdown-generator.js');

/**
 * Load conversations from multiple sources
 */
async function loadAllConversations(extensionContext = null, outputChannel = null) {
    let allConversations = [];
    let cursorCount = 0;
    let clineCount = 0;
    
    // Try to load Cursor conversations
    try {
        const cursorConvs = await getRecentConversations(10, extensionContext);
        cursorCount = cursorConvs.length;
        allConversations = allConversations.concat(cursorConvs.map(conv => ({...conv, source: 'cursor', extensionTag: 'cursor'})));
        const message = `Loaded ${cursorCount} Cursor conversations`;
        if (outputChannel) outputChannel.appendLine(message);
        else console.log(message);
    } catch (error) {
        const message = `Could not load Cursor conversations: ${error.message}`;
        if (outputChannel) outputChannel.appendLine(`WARNING: ${message}`);
        else console.warn(message);
        vscode.window.showWarningMessage(`Could not load Cursor conversations: ${error.message}`);
    }
    
    // Try to load Cline conversations
    try {
        const clineConvs = getRecentClineConversations(10, extensionContext, outputChannel);
        clineCount = clineConvs.length;
        allConversations = allConversations.concat(clineConvs.map(conv => ({...conv, source: 'cline'})));
        const message = `Loaded ${clineCount} Cline conversations`;
        if (outputChannel) outputChannel.appendLine(message);
        else console.log(message);
    } catch (error) {
        const message = `Could not load Cline conversations: ${error.message}`;
        if (outputChannel) outputChannel.appendLine(`WARNING: ${message}`);
        else console.warn(message);
        vscode.window.showWarningMessage(`Could not load Cline conversations: ${error.message}`);
    }
    
    const message = `Total conversations loaded: ${allConversations.length} (Cursor: ${cursorCount}, Cline: ${clineCount})`;
    if (outputChannel) outputChannel.appendLine(message);
    else console.log(message);
    
    // Sort by timestamp (most recent first)
    allConversations.sort((a, b) => {
        const timestampA = a.source === 'cursor' ? a.lastMessageTime : a.timestamp;
        const timestampB = b.source === 'cursor' ? b.lastMessageTime : b.timestamp;
        return new Date(timestampB) - new Date(timestampA);
    });
    
    return allConversations;
}

/**
 * Format conversation for VSCode QuickPick (supports both sources)
 */
function formatConversationForVSCodeUnified(conv, index) {
    // Determine source icon and name based on actual extension
    let sourceIcon = '';
    let sourceName = '';
    
    if (conv.source === 'cursor') {
        sourceIcon = '🎯';
        sourceName = 'Cursor';
    } else {
        // For non-cursor conversations, only show icon/name if it's actually Cline
        const extensionId = conv.extensionId || (conv.baseDir ? 
            (conv.baseDir.includes('saoudrizwan.claude-dev') ? 'saoudrizwan.claude-dev' : 
             conv.baseDir.includes('xai.grok-dev') ? 'xai.grok-dev' : 'unknown') : 'unknown');
        
        if (extensionId === 'saoudrizwan.claude-dev') {
            sourceIcon = '🤖';
            sourceName = 'Cline';
        }
        // For xai.grok-dev or other extensions, leave icon and sourceName empty
    }
    
    // For Cline conversations, use friendly name from actual extension ID if available
    let displayExtensionName;
    if (conv.source === 'cursor') {
        displayExtensionName = 'Cursor';
    } else {
        // For Cline, use the extension ID if available, otherwise determine from baseDir
        if (conv.extensionId && conv.extensionId !== 'unknown') {
            displayExtensionName = getExtensionFriendlyName(conv.extensionId);
        } else if (conv.baseDir) {
            if (conv.baseDir.includes('saoudrizwan.claude-dev')) {
                displayExtensionName = getExtensionFriendlyName('saoudrizwan.claude-dev');
            } else if (conv.baseDir.includes('xai.grok-dev')) {
                displayExtensionName = getExtensionFriendlyName('xai.grok-dev');
            } else {
                displayExtensionName = 'Cline';
            }
        } else {
            displayExtensionName = 'Cline';
        }
    }
    
    // Add model information for Cline conversations
    let modelInfo = '';
    if (conv.source === 'cline' && conv.model) {
        const shortModelName = conv.model.replace('xai-featureflagging-grok-4-code-searchreplace-nocompletion-latest', 'Grok-4')
                                        .replace('xai-featureflagging-grok-', 'Grok-')
                                        .replace('-code-searchreplace-nocompletion-latest', '')
                                        .replace('-latest', '');
        modelInfo = ` • ${shortModelName}`;
    }
    
    // Get the correct timestamp field based on source
    const timestamp = conv.source === 'cursor' ? conv.lastMessageTime : conv.timestamp;
    
    // Build description - only include source info if we have it
    let description = '';
    if (sourceIcon && sourceName) {
        description = `${sourceIcon} ${sourceName} • ${conv.messageCount} messages${modelInfo}`;
    } else {
        description = `${conv.messageCount} messages${modelInfo}`;
    }
    
    return {
        label: `${index + 1}. ${conv.title}`,
        description: description,
        detail: `${new Date(timestamp).toLocaleString()} • ${displayExtensionName}${modelInfo ? ` • Model: ${conv.model}` : ''}`,
        conversation: conv.source === 'cursor' ? conv.conversation : conv,
        index
    };
}

/**
 * Show conversation selection UI in VSCode (unified for both Cursor and Cline)
 */
async function showConversationSelector(extensionContext = null, outputChannel = null) {
    try {
        // Show progress
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Loading conversations...",
            cancellable: true
        }, async (progress, token) => {
            // Check if cancelled
            if (token.isCancellationRequested) {
                return null;
            }
            
            progress.report({ increment: 0, message: "Loading conversations..." });
            
            // Get conversations from all sources
            let conversations;
            try {
                conversations = await loadAllConversations(extensionContext, outputChannel);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to load conversations: ${error.message}`);
                return null;
            }
            
            if (conversations.length === 0) {
                vscode.window.showInformationMessage('No conversations found. Make sure you have used Cursor or Cline recently.');
                return null;
            }
            
            progress.report({ increment: 50, message: "Preparing conversation list..." });
            
            // Format conversations for QuickPick
            const items = conversations.map((conv, index) => formatConversationForVSCodeUnified(conv, index));
            
            progress.report({ increment: 100, message: "Ready!" });
            
            return { conversations, items };
        });
        
        if (!result) {
            return; // User cancelled or no conversations
        }
        
        const { items } = result;
        
        // Show QuickPick
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a conversation to export to markdown',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selected) {
            return; // User cancelled
        }
        
        // Generate and open markdown
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Exporting conversation...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Generating markdown..." });
            
            try {
                let markdown;
                
                // Handle different conversation sources
                if (selected.conversation.source === 'cline') {
                    // Load and parse Cline conversation
                    const taskData = extractClineTask(selected.conversation.id, selected.conversation.baseDir, null, outputChannel);
                    const parsedConversation = parseClineConversation(taskData);
                    markdown = conversationToMarkdown(parsedConversation);
                } else {
                    // Handle Cursor conversations
                    markdown = generateMarkdownConversation(selected.conversation);
                }
                
                progress.report({ increment: 50, message: "Opening in new file..." });
                
                // Create new untitled document with markdown content
                const doc = await vscode.workspace.openTextDocument({
                    content: markdown,
                    language: 'markdown'
                });
                
                // Show the document
                await vscode.window.showTextDocument(doc);
                
                progress.report({ increment: 100, message: "Done!" });
                
                // Show success message with save option
                const sourceLabel = selected.conversation.source === 'cline' ? 'Cline' : 'Cursor';
                const action = await vscode.window.showInformationMessage(
                    `${sourceLabel} conversation opened in new file! Use Cmd+S to save.`,
                    'Save Now'
                );
                
                if (action === 'Save Now') {
                    await vscode.commands.executeCommand('workbench.action.files.save');
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export conversation: ${error.message}`);
            }
        });
        
    } catch (error) {
        vscode.window.showErrorMessage(`Unexpected error: ${error.message}`);
    }
}

/**
 * Show conversation selection UI in VSCode for JSON export
 */
async function showConversationSelectorJSON(extensionContext = null, outputChannel = null) {
    try {
        // Show progress
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Loading conversations...",
            cancellable: true
        }, async (progress, token) => {
            // Check if cancelled
            if (token.isCancellationRequested) {
                return null;
            }
            
            progress.report({ increment: 0, message: "Loading conversations..." });
            
            // Get conversations from all sources
            let conversations;
            try {
                conversations = await loadAllConversations(extensionContext, outputChannel);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to load conversations: ${error.message}`);
                return null;
            }
            
            if (conversations.length === 0) {
                vscode.window.showInformationMessage('No conversations found. Make sure you have used Cursor or Cline recently.');
                return null;
            }
            
            progress.report({ increment: 50, message: "Preparing conversation list..." });
            
            // Format conversations for QuickPick
            const items = conversations.map((conv, index) => formatConversationForVSCodeUnified(conv, index));
            
            progress.report({ increment: 100, message: "Ready!" });
            
            return { conversations, items };
        });
        
        if (!result) {
            return; // User cancelled or no conversations
        }
        
        const { items } = result;
        
        // Show QuickPick
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a conversation to export to JSON',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selected) {
            return; // User cancelled
        }
        
        // Generate and open JSON
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Exporting conversation...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Generating JSON..." });
            
            try {
                let jsonContent;
                
                // Handle different conversation sources
                if (selected.conversation.source === 'cline') {
                    // Load and parse Cline conversation
                    const taskData = extractClineTask(selected.conversation.id, selected.conversation.baseDir, null, outputChannel);
                    const parsedConversation = parseClineConversation(taskData);
                    jsonContent = JSON.stringify(parsedConversation, null, 2);
                } else {
                    // Handle Cursor conversations
                    jsonContent = JSON.stringify(selected.conversation, null, 2);
                }
                
                progress.report({ increment: 50, message: "Opening in new file..." });
                
                // Create new untitled document with JSON content
                const doc = await vscode.workspace.openTextDocument({
                    content: jsonContent,
                    language: 'json'
                });
                
                // Show the document
                await vscode.window.showTextDocument(doc);
                
                progress.report({ increment: 100, message: "Done!" });
                
                // Show success message with save option
                const sourceLabel = selected.conversation.source === 'cline' ? 'Cline' : 'Cursor';
                const action = await vscode.window.showInformationMessage(
                    `${sourceLabel} conversation opened as JSON! Use Cmd+S to save.`,
                    'Save Now'
                );
                
                if (action === 'Save Now') {
                    await vscode.commands.executeCommand('workbench.action.files.save');
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export conversation: ${error.message}`);
            }
        });
        
    } catch (error) {
        vscode.window.showErrorMessage(`Unexpected error: ${error.message}`);
    }
}

module.exports = {
    showConversationSelector,
    showConversationSelectorJSON
};