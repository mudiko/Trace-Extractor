const vscode = require('vscode');
const { showConversationSelector, showConversationSelectorJSON } = require('./src/vscode-commands.js');

/**
 * VSCode Extension Entry Point for Trace Extractor
 */

function activate(context) {
    console.log('Trace Extractor extension is now active');
    
    // Debug: Log available commands
    vscode.commands.getCommands().then(commands => {
        const traceCommands = commands.filter(cmd => cmd.includes('trace-extractor'));
        console.log('Available trace-extractor commands:', traceCommands);
    });
    
    // Register the main commands
    const disposable = vscode.commands.registerCommand('trace-extractor.selectChat', async () => {
        console.log('trace-extractor.selectChat command executed');
        await showConversationSelector(context);
    });
    
    const disposableJSON = vscode.commands.registerCommand('trace-extractor.selectChatJSON', async () => {
        console.log('trace-extractor.selectChatJSON command executed');
        await showConversationSelectorJSON(context);
    });
    
    context.subscriptions.push(disposable, disposableJSON);
    
    // Debug: Confirm command registration
    console.log('trace-extractor.selectChat and trace-extractor.selectChatJSON commands registered');
    
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
    console.log('Trace Extractor extension deactivated');
}

module.exports = { activate, deactivate };