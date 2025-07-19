#!/usr/bin/env node

const { extractCursorDiskKV } = require('../src/extractor');
const { reconstructConversation } = require('../src/conversation-parser');

async function debugToolData() {
    const data = await extractCursorDiskKV();
    const targetId = 'a528de3d-b5a6-454f-bf73-4d829383ba05';
    
    for (const [composerId, bubbles] of Object.entries(data.bubbles)) {
        if (composerId.startsWith('183bead9')) {
            console.log('CONVERSATION:', composerId);
            
            const conversation = reconstructConversation(
                composerId,
                data.bubbles,
                data.checkpoints,
                data.codeDiffs,
                data.composers[composerId]
            );
            
            console.log('Messages:', conversation.messages.length);
            
            conversation.messages.forEach((message, i) => {
                console.log(`\nMESSAGE ${i+1} (${message.type}):`);
                console.log('Tool calls:', message.content.tool_calls.length);
                
                message.content.tool_calls.forEach((toolCall, j) => {
                    console.log(`\n  TOOL CALL ${j+1}:`);
                    console.log('  Tool name:', toolCall.tool_name);
                    console.log('  Parameters keys:', Object.keys(toolCall.parameters));
                    
                    if (toolCall.tool_name === 'Edit' || toolCall.tool_name === 'search_replace') {
                        console.log('  OLD STRING PRESENT:', !!toolCall.parameters.old_string);
                        console.log('  NEW STRING PRESENT:', !!toolCall.parameters.new_string);
                        
                        if (toolCall.parameters.old_string) {
                            console.log('  Old string length:', toolCall.parameters.old_string.length);
                            console.log('  Old string preview:', toolCall.parameters.old_string.substring(0, 100) + '...');
                        }
                        if (toolCall.parameters.new_string) {
                            console.log('  New string length:', toolCall.parameters.new_string.length);
                            console.log('  New string preview:', toolCall.parameters.new_string.substring(0, 100) + '...');
                        }
                    }
                    
                    // Check if this tool call contains the target ID
                    const toolStr = JSON.stringify(toolCall);
                    if (toolStr.includes(targetId)) {
                        console.log('  *** CONTAINS TARGET ID ***');
                        console.log('  Raw content preview:', toolCall.raw_content ? toolCall.raw_content.substring(0, 200) + '...' : 'No raw content');
                    }
                });
            });
            
            // Also check raw bubbles for tool data that might not be parsed correctly
            console.log('\n=== RAW BUBBLE ANALYSIS ===');
            for (const [bubbleId, bubble] of Object.entries(bubbles)) {
                const bubbleStr = JSON.stringify(bubble);
                if (bubbleStr.includes(targetId)) {
                    console.log(`\nBUBBLE: ${bubbleId}`);
                    
                    if (bubble.toolFormerData) {
                        console.log('  Raw tool data:', JSON.stringify(bubble.toolFormerData, null, 2));
                        
                        // Try to parse rawArgs manually
                        if (bubble.toolFormerData.rawArgs) {
                            try {
                                const parsed = JSON.parse(bubble.toolFormerData.rawArgs);
                                console.log('  Parsed rawArgs keys:', Object.keys(parsed));
                                
                                if (parsed.old_string && parsed.new_string) {
                                    console.log('  *** HAS DIFF DATA IN RAW ARGS ***');
                                    console.log('  Old string length:', parsed.old_string.length);
                                    console.log('  New string length:', parsed.new_string.length);
                                }
                            } catch (e) {
                                console.log('  Failed to parse rawArgs:', e.message);
                                console.log('  Raw args preview:', bubble.toolFormerData.rawArgs.substring(0, 200) + '...');
                            }
                        }
                    }
                }
            }
            
            break;
        }
    }
}

debugToolData().catch(console.error);