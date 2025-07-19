#!/usr/bin/env node

/**
 * Test specific request ID to debug missing code diff
 */

const { extractCursorDiskKV, parseMessageContent } = require('../src/extractor');
const { reconstructConversation } = require('../src/conversation-parser');
const { generateMarkdownConversation } = require('../src/markdown-generator');

async function testSpecificRequest() {
    const targetRequestId = process.argv[2] || 'bde16f1d-48ae-4787-bfc7-45dba72f5c4e';
    
    console.log(`🔍 Testing specific request ID: ${targetRequestId}\n`);
    
    try {
        // Extract all data
        console.log('📊 Extracting Cursor data...');
        const extractedData = await extractCursorDiskKV();
        
        if (!extractedData.composers || Object.keys(extractedData.composers).length === 0) {
            console.log('❌ No conversations found');
            return;
        }

        console.log(`Found ${Object.keys(extractedData.composers).length} conversations`);
        
        // Look for the specific request ID in all data structures
        console.log('\n🔍 Searching for request ID in all data structures...');
        
        let foundInBubbles = false;
        let foundInCheckpoints = false;
        let foundInCodeDiffs = false;
        let foundInComposers = false;
        let matchingConversations = [];
        
        // Search in bubbles
        for (const [composerId, bubbles] of Object.entries(extractedData.bubbles)) {
            for (const [bubbleId, bubble] of Object.entries(bubbles)) {
                const bubbleStr = JSON.stringify(bubble);
                if (bubbleStr.includes(targetRequestId)) {
                    foundInBubbles = true;
                    console.log(`✅ Found in bubble: ${bubbleId} (conversation: ${composerId.substring(0, 8)})`);
                    
                    if (!matchingConversations.includes(composerId)) {
                        matchingConversations.push(composerId);
                    }
                    
                    // Analyze the bubble content
                    console.log(`   - Bubble type: ${bubble.type}`);
                    console.log(`   - Has text: ${!!bubble.text}`);
                    console.log(`   - Has thinking: ${!!bubble.thinking}`);
                    console.log(`   - Has toolFormerData: ${!!bubble.toolFormerData}`);
                    
                    if (bubble.text && bubble.text.includes(targetRequestId)) {
                        console.log(`   - Found in text content`);
                        const parsed = parseMessageContent(bubble.text);
                        console.log(`   - Parsed tool calls: ${parsed.tool_calls.length}`);
                        console.log(`   - Parsed code blocks: ${parsed.code_blocks.length}`);
                        
                        if (parsed.code_blocks.length > 0) {
                            console.log(`   - Code blocks found:`);
                            parsed.code_blocks.forEach((block, i) => {
                                console.log(`     ${i+1}. Language: ${block.language}, Length: ${block.code.length}`);
                            });
                        }
                    }
                    
                    if (bubble.toolFormerData) {
                        console.log(`   - Tool data: ${JSON.stringify(bubble.toolFormerData, null, 2).substring(0, 200)}...`);
                    }
                }
            }
        }
        
        // Search in checkpoints
        for (const [composerId, checkpoints] of Object.entries(extractedData.checkpoints)) {
            for (const [checkpointId, checkpoint] of Object.entries(checkpoints)) {
                const checkpointStr = JSON.stringify(checkpoint);
                if (checkpointStr.includes(targetRequestId)) {
                    foundInCheckpoints = true;
                    console.log(`✅ Found in checkpoint: ${checkpointId} (conversation: ${composerId.substring(0, 8)})`);
                    
                    if (!matchingConversations.includes(composerId)) {
                        matchingConversations.push(composerId);
                    }
                }
            }
        }
        
        // Search in code diffs
        for (const [composerId, codeDiffs] of Object.entries(extractedData.codeDiffs)) {
            for (const [diffId, codeDiff] of Object.entries(codeDiffs)) {
                const diffStr = JSON.stringify(codeDiff);
                if (diffStr.includes(targetRequestId)) {
                    foundInCodeDiffs = true;
                    console.log(`✅ Found in code diff: ${diffId} (conversation: ${composerId.substring(0, 8)})`);
                    console.log(`   - Code diff structure:`, Object.keys(codeDiff));
                    console.log(`   - Content preview:`, JSON.stringify(codeDiff, null, 2).substring(0, 500) + '...');
                    
                    if (!matchingConversations.includes(composerId)) {
                        matchingConversations.push(composerId);
                    }
                }
            }
        }
        
        // Search in composers
        for (const [composerId, composer] of Object.entries(extractedData.composers)) {
            const composerStr = JSON.stringify(composer);
            if (composerStr.includes(targetRequestId)) {
                foundInComposers = true;
                console.log(`✅ Found in composer: ${composerId.substring(0, 8)}`);
                
                if (!matchingConversations.includes(composerId)) {
                    matchingConversations.push(composerId);
                }
            }
        }
        
        // Summary
        console.log('\n📊 SEARCH RESULTS:');
        console.log(`Found in bubbles: ${foundInBubbles}`);
        console.log(`Found in checkpoints: ${foundInCheckpoints}`);
        console.log(`Found in code diffs: ${foundInCodeDiffs}`);
        console.log(`Found in composers: ${foundInComposers}`);
        console.log(`Matching conversations: ${matchingConversations.length}`);
        
        if (matchingConversations.length === 0) {
            console.log('\n❌ Request ID not found in any data structure');
            
            // Search for partial matches
            console.log('\n🔍 Searching for partial matches...');
            const partialId = targetRequestId.split('-')[0]; // First part
            
            for (const [composerId, bubbles] of Object.entries(extractedData.bubbles)) {
                for (const [bubbleId, bubble] of Object.entries(bubbles)) {
                    const bubbleStr = JSON.stringify(bubble);
                    if (bubbleStr.includes(partialId)) {
                        console.log(`📍 Partial match in bubble: ${bubbleId} (conversation: ${composerId.substring(0, 8)})`);
                    }
                }
            }
            return;
        }
        
        // Analyze each matching conversation
        for (const composerId of matchingConversations) {
            console.log(`\n🔍 Analyzing conversation: ${composerId.substring(0, 8)}`);
            
            try {
                const conversation = reconstructConversation(
                    composerId,
                    extractedData.bubbles,
                    extractedData.checkpoints,
                    extractedData.codeDiffs,
                    extractedData.composers[composerId]
                );
                
                console.log(`   - Messages: ${conversation.messages.length}`);
                console.log(`   - Code diffs: ${Object.keys(conversation.code_diffs).length}`);
                
                // Check if request ID appears in any message
                conversation.messages.forEach((message, index) => {
                    const messageStr = JSON.stringify(message);
                    if (messageStr.includes(targetRequestId)) {
                        console.log(`   - Found in message ${index + 1} (${message.type})`);
                        
                        // Check tool calls for code diffs
                        if (message.content.tool_calls) {
                            message.content.tool_calls.forEach((toolCall, toolIndex) => {
                                const toolStr = JSON.stringify(toolCall);
                                if (toolStr.includes(targetRequestId)) {
                                    console.log(`     - Found in tool call ${toolIndex + 1}: ${toolCall.tool_name}`);
                                    
                                    if (toolCall.tool_name === 'Edit' || toolCall.tool_name === 'search_replace') {
                                        console.log(`     - This is a code diff tool call!`);
                                        console.log(`     - Parameters:`, Object.keys(toolCall.parameters));
                                        
                                        if (toolCall.parameters.old_string || toolCall.parameters.new_string) {
                                            console.log(`     - Has old_string: ${!!toolCall.parameters.old_string}`);
                                            console.log(`     - Has new_string: ${!!toolCall.parameters.new_string}`);
                                            
                                            if (toolCall.parameters.old_string) {
                                                console.log(`     - Old string length: ${toolCall.parameters.old_string.length}`);
                                            }
                                            if (toolCall.parameters.new_string) {
                                                console.log(`     - New string length: ${toolCall.parameters.new_string.length}`);
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                });
                
                // Generate markdown to see how it appears
                console.log(`\n📝 Generating markdown for conversation...`);
                const markdown = generateMarkdownConversation(conversation);
                
                // Check if request ID appears in markdown
                if (markdown.includes(targetRequestId)) {
                    console.log(`✅ Request ID appears in generated markdown`);
                    
                    // Find the specific section
                    const lines = markdown.split('\n');
                    lines.forEach((line, index) => {
                        if (line.includes(targetRequestId)) {
                            console.log(`   - Line ${index + 1}: ${line.substring(0, 100)}...`);
                        }
                    });
                } else {
                    console.log(`❌ Request ID does NOT appear in generated markdown`);
                    console.log(`   - This indicates the code diff parsing/formatting might be failing`);
                }
                
                // Save this conversation's markdown for inspection
                const fs = require('fs');
                const filename = `debug-conversation-${composerId.substring(0, 8)}.md`;
                fs.writeFileSync(filename, markdown);
                console.log(`   - Saved markdown to: ${filename}`);
                
            } catch (error) {
                console.log(`❌ Error reconstructing conversation: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
    }
}

// Run the test
if (require.main === module) {
    testSpecificRequest().catch(console.error);
}

module.exports = { testSpecificRequest };