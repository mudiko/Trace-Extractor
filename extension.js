const vscode = require('vscode');
const { showConversationSelector, showConversationSelectorJSON } = require('./src/vscode-commands.js');

/**
 * VSCode Extension Entry Point for Trace Extractor
 */

let outputChannel;

function activate(context) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('Trace Extractor');
    context.subscriptions.push(outputChannel);
    
    outputChannel.appendLine('Trace Extractor extension is now active');
    
    // Debug: Log available commands
    vscode.commands.getCommands().then(commands => {
        const traceCommands = commands.filter(cmd => cmd.includes('trace-extractor'));
        outputChannel.appendLine(`Available trace-extractor commands: ${JSON.stringify(traceCommands)}`);
    });
    
    // Register the main commands
    const disposable = vscode.commands.registerCommand('trace-extractor.selectChat', async () => {
        outputChannel.appendLine('trace-extractor.selectChat command executed');
        await showConversationSelector(context, outputChannel);
    });
    
    const disposableJSON = vscode.commands.registerCommand('trace-extractor.selectChatJSON', async () => {
        outputChannel.appendLine('trace-extractor.selectChatJSON command executed');
        await showConversationSelectorJSON(context, outputChannel);
    });
    
    context.subscriptions.push(disposable, disposableJSON);
    
    // Debug: Confirm command registration
    outputChannel.appendLine('trace-extractor.selectChat and trace-extractor.selectChatJSON commands registered');
    
    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Trace Extractor is ready! Now supports both Cursor and Cline conversations. Use "Export Conversation to Markdown" from the command palette.',
            'Show Command'
        ).then(selection => {
            if (selection === 'Show Command') {
                vscode.commands.executeCommand('workbench.action.showCommands');
            }
        });
        
        context.globalState.update('hasShownWelcome', true);
    }
}

function deactivate() {
    if (outputChannel) {
        outputChannel.appendLine('Trace Extractor extension deactivated');
        outputChannel.dispose();
    }
}

function getOutputChannel() {
    return outputChannel;
}

module.exports = { activate, deactivate, getOutputChannel };