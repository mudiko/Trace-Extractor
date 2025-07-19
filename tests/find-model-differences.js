#!/usr/bin/env node

const { extractCursorDiskKV } = require('../src/extractor');

async function findDifferentModels() {
    const data = await extractCursorDiskKV();
    
    console.log('🔍 SEARCHING FOR MODEL AND TOOL STRUCTURE DIFFERENCES\n');
    
    // Check for conversations with different tool structures
    console.log('TOOL STRUCTURE VARIATIONS:\n');
    
    const toolStructures = new Map();
    
    for (const [composerId, bubbles] of Object.entries(data.bubbles)) {
        for (const [bubbleId, bubble] of Object.entries(bubbles)) {
            if (bubble.toolFormerData) {
                const toolName = bubble.toolFormerData.name || bubble.toolFormerData.tool;
                if (toolName === 'edit_file' || toolName === 'search_replace' || toolName === 'Edit') {
                    
                    const structure = {
                        toolName,
                        keys: Object.keys(bubble.toolFormerData).sort(),
                        hasResult: !!bubble.toolFormerData.result,
                        hasError: !!bubble.toolFormerData.error,
                        resultType: null
                    };
                    
                    if (bubble.toolFormerData.result) {
                        try {
                            const result = JSON.parse(bubble.toolFormerData.result);
                            structure.resultType = Object.keys(result).sort().join(',');
                        } catch (e) {
                            structure.resultType = 'parse_error';
                        }
                    }
                    
                    const structureKey = JSON.stringify(structure);
                    if (!toolStructures.has(structureKey)) {
                        toolStructures.set(structureKey, {
                            structure,
                            examples: [],
                            count: 0
                        });
                    }
                    
                    const structData = toolStructures.get(structureKey);
                    structData.count++;
                    if (structData.examples.length < 3) {
                        structData.examples.push(composerId.substring(0, 8));
                    }
                }
            }
        }
    }
    
    for (const [key, data] of toolStructures.entries()) {
        if (data.count > 5) {
            console.log(`${data.structure.toolName} (${data.count} instances):`);
            console.log('  Keys:', data.structure.keys.join(', '));
            console.log('  Has result:', data.structure.hasResult);
            console.log('  Has error:', data.structure.hasError);
            console.log('  Result type:', data.structure.resultType);
            console.log('  Examples:', data.examples.join(', '));
            console.log('');
        }
    }
    
    // Look for specific examples of different formats
    console.log('=== SPECIFIC EXAMPLES ===\n');
    
    // Find one edit_file and one search_replace example
    let editFileExample = null;
    let searchReplaceExample = null;
    
    for (const [composerId, bubbles] of Object.entries(data.bubbles)) {
        if (editFileExample && searchReplaceExample) break;
        
        for (const [bubbleId, bubble] of Object.entries(bubbles)) {
            if (bubble.toolFormerData) {
                const toolName = bubble.toolFormerData.name || bubble.toolFormerData.tool;
                
                if (toolName === 'edit_file' && !editFileExample && bubble.toolFormerData.result) {
                    editFileExample = {
                        conversationId: composerId.substring(0, 8),
                        bubbleId,
                        toolData: bubble.toolFormerData
                    };
                }
                
                if (toolName === 'search_replace' && !searchReplaceExample) {
                    searchReplaceExample = {
                        conversationId: composerId.substring(0, 8),
                        bubbleId,
                        toolData: bubble.toolFormerData
                    };
                }
            }
        }
    }
    
    if (editFileExample) {
        console.log('EDIT_FILE EXAMPLE (', editFileExample.conversationId, '):');
        console.log('Tool keys:', Object.keys(editFileExample.toolData));
        
        if (editFileExample.toolData.result) {
            try {
                const result = JSON.parse(editFileExample.toolData.result);
                console.log('Result structure:', Object.keys(result));
                if (result.diff && result.diff.chunks) {
                    console.log('Diff chunks count:', result.diff.chunks.length);
                    console.log('First chunk sample keys:', Object.keys(result.diff.chunks[0]));
                }
            } catch (e) {
                console.log('Result parse error:', e.message);
            }
        }
        console.log('');
    }
    
    if (searchReplaceExample) {
        console.log('SEARCH_REPLACE EXAMPLE (', searchReplaceExample.conversationId, '):');
        console.log('Tool keys:', Object.keys(searchReplaceExample.toolData));
        
        if (searchReplaceExample.toolData.rawArgs) {
            try {
                const rawArgs = JSON.parse(searchReplaceExample.toolData.rawArgs);
                console.log('RawArgs keys:', Object.keys(rawArgs));
                console.log('Has old_string:', !!rawArgs.old_string);
                console.log('Has new_string:', !!rawArgs.new_string);
            } catch (e) {
                console.log('RawArgs parse error:', e.message);
            }
        }
        console.log('');
    }
}

findDifferentModels().catch(console.error);