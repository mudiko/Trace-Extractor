#!/usr/bin/env node

/**
 * Comprehensive test to parse all conversations and identify parsing failures
 * This will help find specific code diffs or bubbles that fail to parse
 */

const { extractCursorDiskKV, parseMessageContent } = require('../src/extractor');
const { reconstructConversation } = require('../src/conversation-parser');

class ParsingTestReport {
    constructor() {
        this.totalConversations = 0;
        this.totalBubbles = 0;
        this.totalToolCalls = 0;
        this.totalCodeDiffs = 0;
        this.failedConversations = [];
        this.failedBubbles = [];
        this.failedToolCalls = [];
        this.failedCodeDiffs = [];
        this.parsingErrors = [];
        this.jsonParsingErrors = [];
        this.regexFailures = [];
        this.toolNameInferenceFailures = [];
    }

    addError(type, error, context = {}) {
        this.parsingErrors.push({
            type,
            error: error.message || error,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        });
    }

    generateReport() {
        const successRate = this.totalBubbles > 0 ? 
            ((this.totalBubbles - this.failedBubbles.length) / this.totalBubbles * 100).toFixed(2) : 0;

        return {
            summary: {
                totalConversations: this.totalConversations,
                totalBubbles: this.totalBubbles,
                totalToolCalls: this.totalToolCalls,
                totalCodeDiffs: this.totalCodeDiffs,
                successRate: `${successRate}%`,
                failedConversations: this.failedConversations.length,
                failedBubbles: this.failedBubbles.length,
                failedToolCalls: this.failedToolCalls.length,
                failedCodeDiffs: this.failedCodeDiffs.length,
                totalErrors: this.parsingErrors.length
            },
            failures: {
                conversations: this.failedConversations,
                bubbles: this.failedBubbles,
                toolCalls: this.failedToolCalls,
                codeDiffs: this.failedCodeDiffs
            },
            errors: {
                parsing: this.parsingErrors,
                jsonParsing: this.jsonParsingErrors,
                regex: this.regexFailures,
                toolNameInference: this.toolNameInferenceFailures
            }
        };
    }
}

/**
 * Test message content parsing with detailed error reporting
 */
function testMessageContentParsing(content, bubbleId, composerId) {
    const errors = [];
    
    try {
        if (!content || typeof content !== 'string') {
            return { success: true, parsed: null, errors: [] };
        }

        // Test function calls pattern
        const functionCallsPattern = /<function_calls>([\s\S]*?)<\/antml:function_calls>/g;
        let functionCallsMatch;
        const foundFunctionCalls = [];

        while ((functionCallsMatch = functionCallsPattern.exec(content)) !== null) {
            foundFunctionCalls.push(functionCallsMatch[1]);
        }

        // Test antml:function_calls pattern (alternative format)
        const antmlFunctionCallsPattern = /<function_calls>([\s\S]*?)<\/antml:function_calls>/g;
        let antmlMatch;
        const foundAntmlCalls = [];

        while ((antmlMatch = antmlFunctionCallsPattern.exec(content)) !== null) {
            foundAntmlCalls.push(antmlMatch[1]);
        }

        // Test invoke patterns
        const invokePattern = /<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g;
        const antmlInvokePattern = /<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g;
        
        // Test parameter patterns
        const paramPattern = /<parameter name="([^"]+)">([\s\S]*?)<\/antml:parameter>/g;
        const antmlParamPattern = /<parameter name="([^"]+)">([\s\S]*?)<\/antml:parameter>/g;

        // Try actual parsing
        const parsed = parseMessageContent(content);

        // Check for potential issues
        if (content.includes('<function_calls>') && parsed.tool_calls.length === 0) {
            errors.push({
                type: 'function_calls_not_parsed',
                message: 'Content contains <function_calls> but no tool calls were parsed',
                content: content.substring(0, 500) + '...'
            });
        }

        if (content.includes('<function_calls>') && parsed.tool_calls.length === 0) {
            errors.push({
                type: 'antml_function_calls_not_parsed',
                message: 'Content contains <function_calls> but no tool calls were parsed',
                content: content.substring(0, 500) + '...'
            });
        }

        if (content.includes('<thinking>') && parsed.thinking_blocks.length === 0) {
            errors.push({
                type: 'thinking_not_parsed',
                message: 'Content contains <thinking> but no thinking blocks were parsed',
                content: content.substring(0, 500) + '...'
            });
        }

        // Check for actual code blocks (triple backticks followed by newline or language)
        const hasCodeBlocks = /```(\w+)?\s*\n[\s\S]*?```/g.test(content) || /```[\s\S]{10,}```/g.test(content);
        if (hasCodeBlocks && parsed.code_blocks.length === 0) {
            errors.push({
                type: 'code_blocks_not_parsed',
                message: 'Content contains ``` but no code blocks were parsed',
                content: content.substring(0, 500) + '...'
            });
        }

        return {
            success: errors.length === 0,
            parsed,
            errors,
            stats: {
                functionCallsFound: foundFunctionCalls.length,
                antmlCallsFound: foundAntmlCalls.length,
                parsedToolCalls: parsed.tool_calls.length,
                parsedThinkingBlocks: parsed.thinking_blocks.length,
                parsedCodeBlocks: parsed.code_blocks.length
            }
        };

    } catch (error) {
        return {
            success: false,
            parsed: null,
            errors: [{
                type: 'parsing_exception',
                message: error.message,
                stack: error.stack
            }]
        };
    }
}

/**
 * Test tool data parsing from bubbles
 */
function testToolDataParsing(toolData, bubbleId, composerId) {
    const errors = [];
    
    try {
        if (!toolData) {
            return { success: true, errors: [] };
        }

        // Test JSON parsing of rawArgs
        let parameters = {};
        if (toolData.rawArgs) {
            try {
                parameters = JSON.parse(toolData.rawArgs);
            } catch (jsonError) {
                errors.push({
                    type: 'json_parsing_error',
                    message: `Failed to parse rawArgs as JSON: ${jsonError.message}`,
                    rawArgs: toolData.rawArgs.substring(0, 500) + '...',
                    toolName: toolData.name || toolData.tool || 'unknown'
                });
                parameters = { rawArgs: toolData.rawArgs };
            }
        }

        // Test tool name detection
        let toolName = toolData.name || toolData.tool;
        
        if (!toolName || toolName === 'unknown_tool') {
            errors.push({
                type: 'tool_name_inference_needed',
                message: 'Tool name missing or unknown, inference required',
                toolData: JSON.stringify(toolData, null, 2).substring(0, 500) + '...'
            });
        }

        return {
            success: errors.length === 0,
            errors,
            toolName,
            parameters
        };

    } catch (error) {
        return {
            success: false,
            errors: [{
                type: 'tool_data_parsing_exception',
                message: error.message,
                stack: error.stack
            }]
        };
    }
}

/**
 * Main test function
 */
async function runParsingTest() {
    console.log('🔍 Starting comprehensive parsing test...\n');
    
    const report = new ParsingTestReport();
    
    try {
        // Extract all data
        console.log('📊 Extracting Cursor data...');
        const extractedData = await extractCursorDiskKV();
        
        if (!extractedData.composers || Object.keys(extractedData.composers).length === 0) {
            console.log('❌ No conversations found');
            return;
        }

        report.totalConversations = Object.keys(extractedData.composers).length;
        console.log(`Found ${report.totalConversations} conversations\n`);

        // Test each conversation
        for (const [composerId, composerData] of Object.entries(extractedData.composers)) {
            console.log(`\n🔍 Testing conversation ${composerId.substring(0, 8)}...`);
            
            try {
                // Test conversation reconstruction
                const conversation = reconstructConversation(
                    composerId,
                    extractedData.bubbles,
                    extractedData.checkpoints,
                    extractedData.codeDiffs,
                    composerData
                );

                const composerBubbles = extractedData.bubbles[composerId] || {};
                const composerCodeDiffs = extractedData.codeDiffs[composerId] || {};
                
                report.totalBubbles += Object.keys(composerBubbles).length;
                report.totalCodeDiffs += Object.keys(composerCodeDiffs).length;

                // Test each bubble
                for (const [bubbleId, bubble] of Object.entries(composerBubbles)) {
                    // Test text content parsing
                    if (bubble.text) {
                        const textResult = testMessageContentParsing(bubble.text, bubbleId, composerId);
                        if (!textResult.success) {
                            report.failedBubbles.push({
                                composerId,
                                bubbleId,
                                type: 'text_parsing',
                                errors: textResult.errors,
                                content: bubble.text.substring(0, 200) + '...'
                            });
                            textResult.errors.forEach(error => {
                                report.addError('bubble_text_parsing', error, { composerId, bubbleId });
                            });
                        }
                        
                        if (textResult.parsed) {
                            report.totalToolCalls += textResult.parsed.tool_calls.length;
                        }
                    }

                    // Test thinking content
                    if (bubble.thinking && bubble.thinking.text) {
                        const thinkingResult = testMessageContentParsing(bubble.thinking.text, bubbleId, composerId);
                        if (!thinkingResult.success) {
                            report.failedBubbles.push({
                                composerId,
                                bubbleId,
                                type: 'thinking_parsing',
                                errors: thinkingResult.errors,
                                content: bubble.thinking.text.substring(0, 200) + '...'
                            });
                        }
                    }

                    // Test tool data
                    if (bubble.toolFormerData) {
                        const toolResult = testToolDataParsing(bubble.toolFormerData, bubbleId, composerId);
                        if (!toolResult.success) {
                            report.failedToolCalls.push({
                                composerId,
                                bubbleId,
                                type: 'tool_data_parsing',
                                errors: toolResult.errors,
                                toolData: bubble.toolFormerData
                            });
                            toolResult.errors.forEach(error => {
                                if (error.type === 'json_parsing_error') {
                                    report.jsonParsingErrors.push({ composerId, bubbleId, error });
                                } else if (error.type === 'tool_name_inference_needed') {
                                    report.toolNameInferenceFailures.push({ composerId, bubbleId, error });
                                }
                                report.addError('tool_data_parsing', error, { composerId, bubbleId });
                            });
                        }
                        report.totalToolCalls++;
                    }
                }

                // Test code diffs
                for (const [diffId, codeDiff] of Object.entries(composerCodeDiffs)) {
                    try {
                        // Test if code diff contains parseable content
                        if (codeDiff.content || codeDiff.text || codeDiff.diff) {
                            const content = codeDiff.content || codeDiff.text || codeDiff.diff;
                            const diffResult = testMessageContentParsing(content, diffId, composerId);
                            if (!diffResult.success) {
                                report.failedCodeDiffs.push({
                                    composerId,
                                    diffId,
                                    errors: diffResult.errors,
                                    content: content.substring(0, 200) + '...'
                                });
                            }
                        }
                    } catch (error) {
                        report.failedCodeDiffs.push({
                            composerId,
                            diffId,
                            error: error.message,
                            codeDiff
                        });
                        report.addError('code_diff_parsing', error, { composerId, diffId });
                    }
                }

                console.log(`  ✅ Processed conversation with ${Object.keys(composerBubbles).length} bubbles`);

            } catch (error) {
                report.failedConversations.push({
                    composerId,
                    error: error.message,
                    stack: error.stack
                });
                report.addError('conversation_reconstruction', error, { composerId });
                console.log(`  ❌ Failed to process conversation: ${error.message}`);
            }
        }

    } catch (error) {
        report.addError('extraction', error);
        console.error('❌ Fatal error during extraction:', error);
    }

    // Generate and display report
    console.log('\n' + '='.repeat(80));
    console.log('📊 PARSING TEST REPORT');
    console.log('='.repeat(80));

    const finalReport = report.generateReport();
    
    console.log('\n📈 SUMMARY:');
    console.log(`Total Conversations: ${finalReport.summary.totalConversations}`);
    console.log(`Total Bubbles: ${finalReport.summary.totalBubbles}`);
    console.log(`Total Tool Calls: ${finalReport.summary.totalToolCalls}`);
    console.log(`Total Code Diffs: ${finalReport.summary.totalCodeDiffs}`);
    console.log(`Success Rate: ${finalReport.summary.successRate}`);
    console.log(`Failed Conversations: ${finalReport.summary.failedConversations}`);
    console.log(`Failed Bubbles: ${finalReport.summary.failedBubbles}`);
    console.log(`Failed Tool Calls: ${finalReport.summary.failedToolCalls}`);
    console.log(`Failed Code Diffs: ${finalReport.summary.failedCodeDiffs}`);
    console.log(`Total Errors: ${finalReport.summary.totalErrors}`);

    if (finalReport.failures.bubbles.length > 0) {
        console.log('\n❌ FAILED BUBBLES:');
        finalReport.failures.bubbles.slice(0, 10).forEach((failure, index) => {
            console.log(`\n${index + 1}. Bubble ${failure.bubbleId} in conversation ${failure.composerId.substring(0, 8)}`);
            console.log(`   Type: ${failure.type}`);
            console.log(`   Errors: ${failure.errors.length}`);
            if (failure.errors.length > 0) {
                console.log(`   First Error: ${failure.errors[0].message || failure.errors[0].type}`);
            }
            if (failure.content) {
                console.log(`   Content Preview: ${failure.content.substring(0, 100)}...`);
            }
        });
        if (finalReport.failures.bubbles.length > 10) {
            console.log(`\n... and ${finalReport.failures.bubbles.length - 10} more failed bubbles`);
        }
    }

    if (finalReport.failures.toolCalls.length > 0) {
        console.log('\n❌ FAILED TOOL CALLS:');
        finalReport.failures.toolCalls.slice(0, 5).forEach((failure, index) => {
            console.log(`\n${index + 1}. Tool call in bubble ${failure.bubbleId} (conversation ${failure.composerId.substring(0, 8)})`);
            console.log(`   Type: ${failure.type}`);
            console.log(`   Errors: ${failure.errors.length}`);
            if (failure.errors.length > 0) {
                console.log(`   First Error: ${failure.errors[0].message || failure.errors[0].type}`);
            }
        });
        if (finalReport.failures.toolCalls.length > 5) {
            console.log(`\n... and ${finalReport.failures.toolCalls.length - 5} more failed tool calls`);
        }
    }

    if (report.jsonParsingErrors.length > 0) {
        console.log('\n🔧 JSON PARSING ERRORS:');
        report.jsonParsingErrors.slice(0, 5).forEach((failure, index) => {
            console.log(`${index + 1}. ${failure.error.message}`);
            if (failure.error.rawArgs) {
                console.log(`   Raw Args: ${failure.error.rawArgs.substring(0, 100)}...`);
            }
        });
    }

    if (report.toolNameInferenceFailures.length > 0) {
        console.log('\n🔧 TOOL NAME INFERENCE NEEDED:');
        console.log(`${report.toolNameInferenceFailures.length} tool calls need name inference`);
    }

    // Save detailed report to file
    const fs = require('fs');
    const reportPath = './parsing-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportPath}`);

    console.log('\n✅ Parsing test completed!');
}

// Run the test
if (require.main === module) {
    runParsingTest().catch(console.error);
}

module.exports = { runParsingTest, testMessageContentParsing, testToolDataParsing };