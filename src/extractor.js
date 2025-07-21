const fs = require('fs/promises');
const sqlite3 = require('sqlite3');
const os = require('os');
const path = require('path');

/**
 * Detect current IDE based on environment or process
 * @returns {string} IDE name: 'cursor' or 'vscode'
 */
function detectCurrentIDE() {
    // Check environment variables and process info
    if (process.env.TERM_PROGRAM === 'Cursor' || 
        process.env.VSCODE_CWD && process.env.VSCODE_CWD.includes('Cursor') ||
        process.execPath && process.execPath.includes('Cursor')) {
        return 'cursor';
    }
    // Default to vscode
    return 'vscode';
}

/**
 * Get the path to the Cursor database file based on the operating system
 * Supports custom user data directories when extension context is provided
 * Now IDE-aware: only checks relevant paths based on detected IDE
 */
function getDbPath(extensionContext = null) {
    const platform = os.platform();
    const currentIDE = detectCurrentIDE();
    
    // If we have extension context, try to detect custom user data directory
    if (extensionContext && extensionContext.globalStorageUri) {
        try {
            // The globalStorageUri gives us the path to the extension's global storage
            // We need to navigate up to find the state.vscdb file
            const globalStoragePath = extensionContext.globalStorageUri.fsPath;
            
            // Extract the user data directory from the global storage path
            // Pattern: /path/to/userdata/User/globalStorage/extension-name
            // We want: /path/to/userdata/User/globalStorage/state.vscdb
            const userGlobalStorageDir = path.dirname(globalStoragePath);
            const dbPath = path.join(userGlobalStorageDir, 'state.vscdb');
            
            // Check if this custom path exists
            try {
                const fs = require('fs');
                fs.accessSync(dbPath);
                return dbPath;
            } catch (e) {
                // Fall back to default paths if custom path doesn't exist
            }
        } catch (error) {
            // Fall back to default paths if context parsing fails
        }
    }
    
    // IDE-aware default paths
    const homeDir = os.homedir();
    let possiblePaths = [];
    
    if (currentIDE === 'cursor') {
        // Only check Cursor-specific paths when running in Cursor
        switch (platform) {
            case 'darwin': // macOS
                possiblePaths = [
                    path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
                    path.join(homeDir, '.cursor', 'User', 'globalStorage', 'state.vscdb')
                ];
                break;
            case 'win32': // Windows
                possiblePaths = [
                    path.join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
                ];
                break;
            case 'linux': // Linux
                possiblePaths = [
                    path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
                ];
                break;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    } else {
        // Only check VS Code-specific paths when running in VS Code
        switch (platform) {
            case 'darwin': // macOS
                possiblePaths = [
                    path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'state.vscdb'),
                    path.join(homeDir, '.vscode', 'User', 'globalStorage', 'state.vscdb')
                ];
                break;
            case 'win32': // Windows
                possiblePaths = [
                    path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'state.vscdb')
                ];
                break;
            case 'linux': // Linux
                possiblePaths = [
                    path.join(homeDir, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb')
                ];
                break;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
    
    // Try each possible path until we find one that exists
    for (const dbPath of possiblePaths) {
        try {
            const fs = require('fs');
            fs.accessSync(dbPath);
            return dbPath;
        } catch (e) {
            // Continue to next path
        }
    }
    
    // If no paths found, return the first one (will cause error later but maintains compatibility)
    return possiblePaths[0] || path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

/**
 * Extract data from the cursorDiskKV table which contains the actual conversation content
 */
async function extractCursorDiskKV(dbPath = null, extensionContext = null) {
    const globalDbPath = dbPath || getDbPath(extensionContext);
    const tempDbPath = path.join(os.tmpdir(), `temp_cursor_diskv_${Date.now()}.db`);
    const globalWalPath = globalDbPath + '-wal';
    const globalShmPath = globalDbPath + '-shm';
    const tempWalPath = tempDbPath + '-wal';
    const tempShmPath = tempDbPath + '-shm';
    
    try {
        // Check if source database exists
        try {
            await fs.access(globalDbPath);
        } catch (accessError) {
            return {};
        }
        
        // Copy database and its WAL/SHM files to avoid lock issues and ensure latest data
        await fs.copyFile(globalDbPath, tempDbPath);
        try { await fs.copyFile(globalWalPath, tempWalPath); } catch (e) { /* WAL might not exist */ }
        try { await fs.copyFile(globalShmPath, tempShmPath); } catch (e) { /* SHM might not exist */ }

    } catch (error) {
        return {};
    }
    
    return new Promise((resolve, reject) => {
        
        const db = new sqlite3.Database(tempDbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                resolve({});
                return;
            }
            
            // Extract all relevant entries from cursorDiskKV
            db.all(`SELECT key, value FROM cursorDiskKV 
                   WHERE key LIKE 'bubbleId:%' 
                      OR key LIKE 'checkpointId:%' 
                      OR key LIKE 'codeBlockDiff:%' 
                      OR key LIKE 'composerData:%'
                   ORDER BY key`, [], (err, rows) => {
                if (err) {
                    db.close();
                    resolve({});
                    return;
                }
                
                const extractedData = {
                    bubbles: {},
                    checkpoints: {},
                    codeDiffs: {},
                    composers: {},
                    stats: {
                        totalBubbles: 0,
                        totalCheckpoints: 0,
                        totalCodeDiffs: 0,
                        totalComposers: 0
                    }
                };
                
                for (const row of rows) {
                    const { key, value } = row;
                    
                    if (!value) continue;
                    
                    try {
                        // Parse the JSON value
                        const parsedValue = JSON.parse(value);
                        
                        if (key.startsWith('bubbleId:')) {
                            const parts = key.split(':');
                            const composerId = parts[1];
                            const bubbleId = parts[2];
                            
                            if (!extractedData.bubbles[composerId]) {
                                extractedData.bubbles[composerId] = {};
                            }
                            
                            extractedData.bubbles[composerId][bubbleId] = parsedValue;
                            extractedData.stats.totalBubbles++;
                            
                        } else if (key.startsWith('checkpointId:')) {
                            const parts = key.split(':');
                            const composerId = parts[1];
                            const checkpointId = parts[2];
                            
                            if (!extractedData.checkpoints[composerId]) {
                                extractedData.checkpoints[composerId] = {};
                            }
                            
                            extractedData.checkpoints[composerId][checkpointId] = parsedValue;
                            extractedData.stats.totalCheckpoints++;
                            
                        } else if (key.startsWith('codeBlockDiff:')) {
                            const parts = key.split(':');
                            const composerId = parts[1];
                            const diffId = parts[2];
                            
                            if (!extractedData.codeDiffs[composerId]) {
                                extractedData.codeDiffs[composerId] = {};
                            }
                            
                            extractedData.codeDiffs[composerId][diffId] = parsedValue;
                            extractedData.stats.totalCodeDiffs++;
                            
                        } else if (key.startsWith('composerData:')) {
                            const composerId = key.split(':')[1];
                            extractedData.composers[composerId] = parsedValue;
                            extractedData.stats.totalComposers++;
                        }
                        
                    } catch (error) {
                    }
                }
                
                db.close(async (err) => {
                    if (err) {
                    }
                    
                    // Clean up temp files
                    try {
                        await fs.unlink(tempDbPath);
                        await fs.unlink(tempWalPath);
                        await fs.unlink(tempShmPath);
                    } catch (e) {
                    }
                    
                    resolve(extractedData);
                });
            });
        });
    });
}

/**
 * Parse message content to extract tool calls and other structured data
 */
function parseMessageContent(content) {
    if (!content || typeof content !== 'string') {
        return {
            text: '',
            tool_calls: [],
            tool_results: [],
            thinking_blocks: [],
            code_blocks: [],
            file_operations: []
        };
    }
    
    const parsed = {
        text: content,
        tool_calls: [],
        tool_results: [],
        thinking_blocks: [],
        code_blocks: [],
        file_operations: []
    };
    
    // Extract Claude's function calls format
    const functionCallsPattern = /<function_calls>([\s\S]*?)<\/antml:function_calls>/g;
    let functionCallsMatch;
    
    while ((functionCallsMatch = functionCallsPattern.exec(content)) !== null) {
        const functionCallsContent = functionCallsMatch[1];
        
        // Extract individual function invocations
        const invokePattern = /<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g;
        let invokeMatch;
        
        while ((invokeMatch = invokePattern.exec(functionCallsContent)) !== null) {
            const toolName = invokeMatch[1];
            const parametersContent = invokeMatch[2];
            
            // Parse parameters
            const parameters = {};
            const paramPattern = /<parameter name="([^"]+)">([\s\S]*?)<\/antml:parameter>/g;
            let paramMatch;
            
            while ((paramMatch = paramPattern.exec(parametersContent)) !== null) {
                parameters[paramMatch[1]] = paramMatch[2];
            }
            
            parsed.tool_calls.push({
                tool_name: toolName,
                parameters: parameters,
                raw_content: invokeMatch[0]
            });
        }
    }
    
    // Extract thinking blocks
    const thinkingPattern = /<thinking>([\s\S]*?)<\/antml:thinking>/g;
    let thinkingMatch;
    
    while ((thinkingMatch = thinkingPattern.exec(content)) !== null) {
        parsed.thinking_blocks.push(thinkingMatch[1].trim());
    }
    
    // Extract code blocks - improved pattern to handle various formats
    const codePattern = /```(\w+)?([^\n]*)?\n?([\s\S]*?)```/g;
    let codeMatch;
    
    while ((codeMatch = codePattern.exec(content)) !== null) {
        // Handle both "```lang\ncode```" and "```code```" formats
        let language = codeMatch[1] || 'text';
        let code = codeMatch[3] || codeMatch[2] || '';
        
        // If no language specified but first part looks like code, use it
        if (!codeMatch[1] && codeMatch[2] && !codeMatch[2].includes('\n')) {
            code = codeMatch[2];
        }
        
        parsed.code_blocks.push({
            language: language,
            code: code.trim()
        });
    }
    
    // Extract file operations from tool calls
    for (const toolCall of parsed.tool_calls) {
        if (toolCall.tool_name === 'Read' && toolCall.parameters.file_path) {
            parsed.file_operations.push({
                operation: 'read',
                path: toolCall.parameters.file_path
            });
        } else if (toolCall.tool_name === 'Edit' && toolCall.parameters.file_path) {
            parsed.file_operations.push({
                operation: 'edit',
                path: toolCall.parameters.file_path
            });
        } else if (toolCall.tool_name === 'Write' && toolCall.parameters.file_path) {
            parsed.file_operations.push({
                operation: 'write',
                path: toolCall.parameters.file_path
            });
        }
    }
    
    return parsed;
}

module.exports = {
    extractCursorDiskKV,
    parseMessageContent
};