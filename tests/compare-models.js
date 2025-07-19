#!/usr/bin/env node

const { extractCursorDiskKV } = require('../src/extractor');

async function compareModels() {
    const data = await extractCursorDiskKV();
    
    console.log('🔍 ANALYZING CONVERSATION MODEL DIFFERENCES\n');
    
    // Find the conversation we just analyzed (183bead9)
    const targetConv = '183bead9';
    let targetData = null;
    
    for (const [composerId, composer] of Object.entries(data.composers)) {
        if (composerId.startsWith(targetConv)) {
            targetData = { composerId, composer };
            break;
        }
    }
    
    if (!targetData) {
        console.log('Target conversation not found');
        return;
    }
    
    console.log('TARGET CONVERSATION (183bead9):');
    console.log('Composer data keys:', Object.keys(targetData.composer));
    console.log('Model info:', {
        model: targetData.composer.model,
        modelName: targetData.composer.modelName,
        provider: targetData.composer.provider
    });
    
    // Analyze tool data structure differences
    const targetBubbles = data.bubbles[targetData.composerId] || {};
    let targetToolStructure = null;
    
    for (const [bubbleId, bubble] of Object.entries(targetBubbles)) {
        if (bubble.toolFormerData && bubble.toolFormerData.name === 'edit_file') {
            targetToolStructure = {
                keys: Object.keys(bubble.toolFormerData),
                hasResult: !!bubble.toolFormerData.result,
                hasRawArgs: !!bubble.toolFormerData.rawArgs,
                resultStructure: null
            };
            
            if (bubble.toolFormerData.result) {
                try {
                    const result = JSON.parse(bubble.toolFormerData.result);
                    targetToolStructure.resultStructure = Object.keys(result);
                    targetToolStructure.hasDiff = !!result.diff;
                    targetToolStructure.hasChunks = !!(result.diff && result.diff.chunks);
                } catch (e) {
                    targetToolStructure.resultParseError = e.message;
                }
            }
            break;
        }
    }
    
    console.log('\nTARGET TOOL STRUCTURE:');
    console.log(JSON.stringify(targetToolStructure, null, 2));
    
    // Compare with other conversations to find different models
    console.log('\n=== COMPARING WITH OTHER MODELS ===\n');
    
    const modelComparison = new Map();
    let comparedCount = 0;
    
    for (const [composerId, composer] of Object.entries(data.composers)) {
        if (comparedCount >= 15) break; // Limit comparison
        
        const modelKey = `${composer.model || 'unknown'}-${composer.provider || 'unknown'}`;
        
        if (!modelComparison.has(modelKey)) {
            modelComparison.set(modelKey, {
                model: composer.model,
                provider: composer.provider,
                modelName: composer.modelName,
                examples: [],
                toolStructures: []
            });
        }
        
        const modelData = modelComparison.get(modelKey);
        if (modelData.examples.length < 2) {
            modelData.examples.push(composerId.substring(0, 8));
            
            // Check tool structure for this model
            const bubbles = data.bubbles[composerId] || {};
            for (const [bubbleId, bubble] of Object.entries(bubbles)) {
                if (bubble.toolFormerData && modelData.toolStructures.length < 1) {
                    const toolStructure = {
                        toolName: bubble.toolFormerData.name || bubble.toolFormerData.tool,
                        keys: Object.keys(bubble.toolFormerData),
                        hasResult: !!bubble.toolFormerData.result,
                        hasRawArgs: !!bubble.toolFormerData.rawArgs,
                        hasParams: !!bubble.toolFormerData.params
                    };
                    
                    // Check if it's an edit tool with diff structure
                    if ((toolStructure.toolName === 'edit_file' || toolStructure.toolName === 'Edit') && bubble.toolFormerData.result) {
                        try {
                            const result = JSON.parse(bubble.toolFormerData.result);
                            toolStructure.resultKeys = Object.keys(result);
                            toolStructure.hasDiffChunks = !!(result.diff && result.diff.chunks);
                        } catch (e) {
                            toolStructure.resultParseError = true;
                        }
                    }
                    
                    modelData.toolStructures.push(toolStructure);
                    break;
                }
            }
        }
        
        comparedCount++;
    }
    
    // Display comparison
    for (const [modelKey, modelData] of modelComparison.entries()) {
        console.log(`MODEL: ${modelKey}`);
        console.log(`  Name: ${modelData.modelName || 'N/A'}`);
        console.log(`  Examples: ${modelData.examples.join(', ')}`);
        console.log(`  Tool structures: ${modelData.toolStructures.length}`);
        
        if (modelData.toolStructures.length > 0) {
            const tool = modelData.toolStructures[0];
            console.log(`    Tool: ${tool.toolName}`);
            console.log(`    Keys: ${tool.keys.join(', ')}`);
            console.log(`    Has result: ${tool.hasResult}`);
            console.log(`    Has rawArgs: ${tool.hasRawArgs}`);
            console.log(`    Has params: ${tool.hasParams}`);
            
            if (tool.resultKeys) {
                console.log(`    Result keys: ${tool.resultKeys.join(', ')}`);
                console.log(`    Has diff chunks: ${tool.hasDiffChunks}`);
            }
        }
        console.log('');
    }
    
    // Specific analysis of different tool data formats
    console.log('=== DETAILED TOOL FORMAT ANALYSIS ===\n');
    
    const toolFormats = new Map();
    
    for (const [composerId, bubbles] of Object.entries(data.bubbles)) {
        for (const [bubbleId, bubble] of Object.entries(bubbles)) {
            if (bubble.toolFormerData) {
                const composer = data.composers[composerId];
                const modelKey = `${composer.model || 'unknown'}-${composer.provider || 'unknown'}`;
                const toolName = bubble.toolFormerData.name || bubble.toolFormerData.tool || 'unknown';
                
                const formatKey = `${modelKey}:${toolName}`;
                
                if (!toolFormats.has(formatKey)) {
                    toolFormats.set(formatKey, {
                        model: modelKey,
                        toolName,
                        count: 0,
                        sampleStructure: {
                            keys: Object.keys(bubble.toolFormerData),
                            hasResult: !!bubble.toolFormerData.result,
                            hasRawArgs: !!bubble.toolFormerData.rawArgs,
                            hasParams: !!bubble.toolFormerData.params
                        }
                    });
                }
                
                toolFormats.get(formatKey).count++;
            }
        }
    }
    
    // Show tool format differences
    for (const [formatKey, format] of toolFormats.entries()) {
        if (format.count > 5) { // Only show frequently used formats
            console.log(`${formatKey} (${format.count} instances):`);
            console.log(`  Keys: ${format.sampleStructure.keys.join(', ')}`);
            console.log(`  Has result: ${format.sampleStructure.hasResult}`);
            console.log(`  Has rawArgs: ${format.sampleStructure.hasRawArgs}`);
            console.log(`  Has params: ${format.sampleStructure.hasParams}`);
            console.log('');
        }
    }
}

compareModels().catch(console.error);