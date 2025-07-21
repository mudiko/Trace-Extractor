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
import { getRecentClineConversations } from './src/cline/extractor.js';
import { parseClineConversation } from './src/cline/conversation-parser.js';
import { conversationToMarkdown } from './src/cline/markdown-generator.js';

const BANNER = `
╔══════════════════════════════════════════╗
║            🔍 Trace Extractor            ║
║  Extract Cursor/Cline conversations      ║
╚══════════════════════════════════════════╝
`;

async function main() {
    console.log(chalk.cyan(BANNER));
    
    try {
        // Step 0: Choose conversation source
        const { source } = await inquirer.prompt([
            {
                type: 'list',
                name: 'source',
                message: 'Choose conversation source:',
                choices: [
                    { name: '🎯 Cursor Chat', value: 'cursor' },
                    { name: '🤖 Cline (xai.grok-dev)', value: 'cline' },
                    { name: '🔄 Both (merge)', value: 'both' }
                ]
            }
        ]);
        
        // Step 1: Get recent conversations
        const spinner = ora('Loading recent conversations...').start();
        
        let conversations = [];
        try {
            if (source === 'cursor' || source === 'both') {
                try {
                    const cursorConvs = await getRecentConversations(10);
                    conversations = conversations.concat(cursorConvs.map(conv => ({...conv, source: 'cursor'})));
                } catch (error) {
                    if (source === 'cursor') throw error;
                    console.warn(chalk.yellow('Warning: Could not load Cursor conversations'));
                }
            }
            
            if (source === 'cline' || source === 'both') {
                try {
                    const clineConvs = getRecentClineConversations(10);
                    conversations = conversations.concat(clineConvs.map(conv => ({...conv, source: 'cline'})));
                } catch (error) {
                    if (source === 'cline') throw error;
                    console.warn(chalk.yellow('Warning: Could not load Cline conversations'));
                }
            }
            
            // Sort by timestamp (most recent first)
            conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            spinner.succeed(`Found ${conversations.length} recent conversations`);
        } catch (error) {
            spinner.fail('Failed to load conversations');
            console.error(chalk.red('Error:'), error.message);
            console.log(chalk.yellow('Make sure your chosen IDE is installed and you have used it recently.'));
            process.exit(1);
        }
        
        if (conversations.length === 0) {
            console.log(chalk.yellow('No conversations found. Make sure you have used your chosen IDE recently.'));
            process.exit(0);
        }
        
        // Step 2: Display conversations for selection
        console.log(chalk.bold('\nRecent Conversations:'));
        console.log(chalk.gray('─'.repeat(80)));
        
        conversations.forEach((conv, index) => {
            const sourceIcon = conv.source === 'cursor' ? '🎯' : '🤖';
            const sourceName = conv.source === 'cursor' ? 'Cursor' : 'Cline';
            console.log(`${chalk.cyan((index + 1).toString().padStart(2))}. ${conv.title}`);
            console.log(`    ${sourceIcon} ${sourceName} • ${conv.messageCount} messages • ${new Date(conv.timestamp).toLocaleString()}`);
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
                    ...conversations.map((conv, index) => {
                        const sourceIcon = conv.source === 'cursor' ? '🎯' : '🤖';
                        return {
                            name: `${index + 1}. ${conv.title} ${sourceIcon}`,
                            value: index
                        };
                    }),
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
        
        const selectedConversation = conversations[selectedIndex];
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
            
            // Handle different conversation sources
            if (selectedConversation.source === 'cline') {
                // Load and parse Cline conversation
                const { extractClineTask } = await import('./src/cline/extractor.js');
                const taskData = extractClineTask(selectedConversation.id, selectedConversation.baseDir);
                const parsedConversation = parseClineConversation(taskData);
                
                if (outputFormat === 'json') {
                    content = JSON.stringify(parsedConversation, null, 2);
                    filename = `cline-${selectedConversation.id}.json`;
                    filepath = path.join(outputDir, filename);
                } else {
                    content = conversationToMarkdown(parsedConversation);
                    filename = `cline-${selectedConversation.id}.md`;
                    filepath = path.join(outputDir, filename);
                }
            } else {
                // Handle Cursor conversations (original logic)
                if (outputFormat === 'json') {
                    content = JSON.stringify(selectedConversation.conversation, null, 2);
                    filename = generateConversationFilename(selectedConversation.conversation).replace('.md', '.json');
                    filepath = path.join(outputDir, filename);
                } else {
                    content = generateMarkdownConversation(selectedConversation.conversation);
                    filename = generateConversationFilename(selectedConversation.conversation);
                    filepath = path.join(outputDir, filename);
                }
            }
            
            // Write file
            await fs.writeFile(filepath, content);
            
            exportSpinner.succeed(`${outputFormat.toUpperCase()} exported successfully!`);
            
            // Show summary
            console.log();
            console.log(chalk.bold('📄 Export Summary:'));
            console.log(chalk.green('✓'), 'Source:', chalk.cyan(selectedConversation.source?.toUpperCase() || 'CURSOR'));
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
${chalk.cyan('Trace Extractor')} - Export Cursor/Cline conversations to Markdown

${chalk.bold('Usage:')}
  npx trace-extractor          Start interactive mode
  npx trace-extractor --json   Export as JSON instead of Markdown
  trace-extractor --help       Show this help

${chalk.bold('Features:')}
  • Support for both Cursor and Cline (xai.grok-dev) conversations
  • Interactive selection from recent conversations
  • Rich markdown output with tool calls and thinking
  • Custom output directory selection
  • Progress indicators and colorized output

${chalk.bold('Requirements:')}
  • Cursor IDE or Cline extension with existing conversations
  • Node.js 16+ 

${chalk.bold('Examples:')}
  npx trace-extractor                    # Interactive mode
  npx trace-extractor --help             # Show help
`);
    process.exit(0);
}

// Run the CLI
main().catch(console.error);