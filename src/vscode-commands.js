const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const { 
    getRecentConversations, 
    formatConversationForVSCode, 
    selectConversationByIndex 
} = require('./chat-selector');
const { 
    generateMarkdownConversation, 
    generateConversationFilename 
} = require('./markdown-generator');

/**
 * Show conversation selection UI in VSCode
 */
async function showConversationSelector() {
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
            
            progress.report({ increment: 0, message: "Extracting Cursor data..." });
            
            // Get recent conversations
            let conversations;
            try {
                conversations = await getRecentConversations(10);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to load conversations: ${error.message}. Make sure Cursor is installed and you have used it recently.`);
                return null;
            }
            
            if (conversations.length === 0) {
                vscode.window.showInformationMessage('No conversations found. Make sure you have used Cursor recently.');
                return null;
            }
            
            progress.report({ increment: 50, message: "Preparing conversation list..." });
            
            // Format conversations for QuickPick
            const items = conversations.map((conv, index) => formatConversationForVSCode(conv, index));
            
            progress.report({ increment: 100, message: "Ready!" });
            
            return { conversations, items };
        });
        
        if (!result) {
            return; // User cancelled or no conversations
        }
        
        const { conversations, items } = result;
        
        // Show QuickPick
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a conversation to export to markdown',
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selected) {
            return; // User cancelled
        }
        
        // No need for save dialog - we'll open content directly
        
        // Generate and open markdown
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Exporting conversation...",
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: "Generating markdown..." });
            
            try {
                // Generate markdown
                const markdown = generateMarkdownConversation(selected.conversation);
                
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
                const action = await vscode.window.showInformationMessage(
                    `Conversation opened in new file! Use Cmd+S to save.`,
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
async function showConversationSelectorJSON() {
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
            
            progress.report({ increment: 0, message: "Extracting Cursor data..." });
            
            // Get recent conversations
            let conversations;
            try {
                conversations = await getRecentConversations(10);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to load conversations: ${error.message}. Make sure Cursor is installed and you have used it recently.`);
                return null;
            }
            
            if (conversations.length === 0) {
                vscode.window.showInformationMessage('No conversations found. Make sure you have used Cursor recently.');
                return null;
            }
            
            progress.report({ increment: 50, message: "Preparing conversation list..." });
            
            // Format conversations for QuickPick
            const items = conversations.map((conv, index) => formatConversationForVSCode(conv, index));
            
            progress.report({ increment: 100, message: "Ready!" });
            
            return { conversations, items };
        });
        
        if (!result) {
            return; // User cancelled or no conversations
        }
        
        const { conversations, items } = result;
        
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
                // Generate JSON
                const jsonContent = JSON.stringify(selected.conversation, null, 2);
                
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
                const action = await vscode.window.showInformationMessage(
                    `Conversation opened as JSON! Use Cmd+S to save.`,
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