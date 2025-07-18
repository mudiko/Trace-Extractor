#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { 
    getRecentConversations, 
    formatConversationForCLI, 
    selectConversationByIndex 
} from './src/chat-selector.js';
import { 
    generateMarkdownConversation, 
    generateConversationFilename 
} from './src/markdown-generator.js';

const BANNER = `
╔══════════════════════════════════════════╗
║            🔍 Trace Extractor            ║
║   Extract Cursor conversations to MD     ║
╚══════════════════════════════════════════╝
`;

async function main() {
    console.log(chalk.cyan(BANNER));
    
    try {
        // Step 1: Get recent conversations
        const spinner = ora('Loading recent conversations...').start();
        
        let conversations;
        try {
            conversations = await getRecentConversations(10);
            spinner.succeed(`Found ${conversations.length} recent conversations`);
        } catch (error) {
            spinner.fail('Failed to load conversations');
            console.error(chalk.red('Error:'), error.message);
            console.log(chalk.yellow('Make sure Cursor is installed and you have used it recently.'));
            process.exit(1);
        }
        
        if (conversations.length === 0) {
            console.log(chalk.yellow('No conversations found. Make sure you have used Cursor recently.'));
            process.exit(0);
        }
        
        // Step 2: Display conversations for selection
        console.log(chalk.bold('\nRecent Conversations:'));
        console.log(chalk.gray('─'.repeat(80)));
        
        conversations.forEach((conv, index) => {
            console.log(formatConversationForCLI(conv, index));
            if (index < conversations.length - 1) {
                console.log();
            }
        });
        
        console.log(chalk.gray('─'.repeat(80)));
        
        // Step 3: Get user selection
        const { selectedIndex } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedIndex',
                message: 'Select a conversation to export:',
                choices: [
                    ...conversations.map((conv, index) => ({
                        name: `${index + 1}. ${conv.title}`,
                        value: index
                    })),
                    new inquirer.Separator(),
                    {
                        name: chalk.gray('Cancel'),
                        value: -1
                    }
                ]
            }
        ]);
        
        if (selectedIndex === -1) {
            console.log(chalk.yellow('Operation cancelled.'));
            process.exit(0);
        }
        
        const selectedConversation = selectConversationByIndex(conversations, selectedIndex);
        if (!selectedConversation) {
            console.log(chalk.red('Invalid selection.'));
            process.exit(1);
        }
        
        // Step 4: Get output format (if not specified via --json flag)
        let outputFormat = 'markdown';
        if (jsonMode) {
            outputFormat = 'json';
        } else {
            const { format } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'format',
                    message: 'Select output format:',
                    choices: [
                        { name: 'Markdown (.md)', value: 'markdown' },
                        { name: 'JSON (.json)', value: 'json' }
                    ],
                    default: 'markdown'
                }
            ]);
            outputFormat = format;
        }

        // Step 5: Get output directory
        const { outputDir } = await inquirer.prompt([
            {
                type: 'input',
                name: 'outputDir',
                message: 'Output directory:',
                default: './exported-conversations',
                validate: (input) => {
                    if (!input.trim()) {
                        return 'Please enter a directory path';
                    }
                    return true;
                }
            }
        ]);
        
        // Step 6: Generate output
        const exportSpinner = ora(`Generating ${outputFormat}...`).start();
        
        try {
            // Create output directory
            await fs.mkdir(outputDir, { recursive: true });
            
            let content, filename, filepath;
            
            if (outputFormat === 'json') {
                // Generate JSON content
                content = JSON.stringify(selectedConversation.conversation, null, 2);
                filename = generateConversationFilename(selectedConversation.conversation).replace('.md', '.json');
                filepath = path.join(outputDir, filename);
            } else {
                // Generate markdown content
                content = generateMarkdownConversation(selectedConversation.conversation);
                filename = generateConversationFilename(selectedConversation.conversation);
                filepath = path.join(outputDir, filename);
            }
            
            // Write file
            await fs.writeFile(filepath, content);
            
            exportSpinner.succeed(`${outputFormat.toUpperCase()} exported successfully!`);
            
            // Show summary
            console.log();
            console.log(chalk.bold('📄 Export Summary:'));
            console.log(chalk.green('✓'), 'Format:', chalk.cyan(outputFormat.toUpperCase()));
            console.log(chalk.green('✓'), 'File:', chalk.cyan(filepath));
            console.log(chalk.green('✓'), 'Title:', selectedConversation.title);
            console.log(chalk.green('✓'), 'Messages:', selectedConversation.messageCount);
            console.log(chalk.green('✓'), 'Size:', await getFileSize(filepath));
            
        } catch (error) {
            exportSpinner.fail(`Failed to export ${outputFormat}`);
            console.error(chalk.red('Error:'), error.message);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(chalk.red('Unexpected error:'), error.message);
        process.exit(1);
    }
}

async function getFileSize(filepath) {
    try {
        const stats = await fs.stat(filepath);
        const sizeInKb = (stats.size / 1024).toFixed(1);
        return `${sizeInKb} KB`;
    } catch {
        return 'unknown';
    }
}

// Check for JSON flag
const jsonMode = process.argv.includes('--json');

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
${chalk.cyan('Trace Extractor')} - Export Cursor conversations to Markdown

${chalk.bold('Usage:')}
  npx trace-extractor          Start interactive mode
  npx trace-extractor --json   Export as JSON instead of Markdown
  trace-extractor --help       Show this help

${chalk.bold('Features:')}
  • Interactive selection from last 10 conversations
  • Rich markdown output with tool calls and thinking
  • Custom output directory selection
  • Progress indicators and colorized output

${chalk.bold('Requirements:')}
  • Cursor IDE with existing conversations
  • Node.js 16+ 

${chalk.bold('Examples:')}
  npx trace-extractor                    # Interactive mode
  npx trace-extractor --help             # Show help
`);
    process.exit(0);
}

// Run the CLI
main().catch(console.error);