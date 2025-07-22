const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Safely parse JSON files with better error handling
 * @param {string} filePath - Path to the JSON file
 * @param {any} defaultValue - Default value to return on parse error
 * @param {Object|null} outputChannel - Optional output channel for logging
 * @param {string} taskId - Task ID for error context
 * @returns {any} Parsed JSON or default value
 */
function parseJSONSafely(filePath, defaultValue, outputChannel = null, taskId = '') {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Clean up content - remove any trailing non-JSON content
        const trimmedContent = content.trim();
        
        // Try to find the end of the JSON by looking for the last valid JSON character
        let jsonContent = trimmedContent;
        
        // If the content doesn't start with { or [, it's likely not JSON
        if (!jsonContent.startsWith('{') && !jsonContent.startsWith('[')) {
            throw new Error('Content does not appear to be JSON');
        }
        
        // Try parsing the full content first
        try {
            return JSON.parse(jsonContent);
        } catch (parseError) {
            // If parsing fails due to extra content, try to find the actual JSON end
            // Split by lines and try to find where valid JSON ends
            const lines = jsonContent.split('\n');
            let cumulativeJson = '';
            let braceCount = 0;
            let bracketCount = 0;
            let inString = false;
            let escapeNext = false;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                cumulativeJson += (i > 0 ? '\n' : '') + line;
                
                // Track braces and brackets to find JSON end
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    
                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }
                    
                    if (char === '"' && !escapeNext) {
                        inString = !inString;
                        continue;
                    }
                    
                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                        else if (char === '[') bracketCount++;
                        else if (char === ']') bracketCount--;
                    }
                }
                
                // Try parsing when we have balanced braces/brackets
                if (braceCount === 0 && bracketCount === 0 && cumulativeJson.trim().length > 0) {
                    try {
                        const result = JSON.parse(cumulativeJson);
                        if (outputChannel) {
                            outputChannel.appendLine(`Successfully recovered JSON from corrupted file ${path.basename(filePath)} for task ${taskId}`);
                        }
                        return result;
                    } catch (testParseError) {
                        // Continue trying with more lines
                    }
                }
            }
            
            // If line-by-line parsing failed, try the simpler approach
            const lastBrace = Math.max(jsonContent.lastIndexOf('}'), jsonContent.lastIndexOf(']'));
            if (lastBrace > 0) {
                const potentialJson = jsonContent.substring(0, lastBrace + 1);
                try {
                    const result = JSON.parse(potentialJson);
                    if (outputChannel) {
                        outputChannel.appendLine(`Recovered JSON by truncation from ${path.basename(filePath)} for task ${taskId}`);
                    }
                    return result;
                } catch (secondParseError) {
                    // If that also fails, throw the original error
                    throw parseError;
                }
            } else {
                throw parseError;
            }
        }
    } catch (error) {
        const message = `Failed to parse JSON file ${path.basename(filePath)} for task ${taskId}: ${error.message}`;
        if (outputChannel) {
            outputChannel.appendLine(`WARNING: ${message}`);
        } else {
            console.warn('Warning:', message);
        }
        return defaultValue;
    }
}

// Supported Cline extension IDs
const CLINE_EXTENSION_IDS = [
    'saoudrizwan.claude-dev',  // New Cline extension
    'xai.grok-dev'             // Original Grok extension
];

/**
 * Get friendly name for extension ID
 * @param {string} extensionId - The extension ID
 * @returns {string} Friendly name
 */
function getExtensionFriendlyName(extensionId) {
    switch (extensionId) {
        case 'saoudrizwan.claude-dev':
            return 'Cline';
        default:
            return extensionId;
    }
}

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
 * Find Cline data directories based on current IDE
 * Supports custom user data directories when extension context is provided
 * @param {string|null} ideHint - Optional IDE hint ('cursor' or 'vscode')
 * @param {Object|null} extensionContext - Optional VS Code extension context for dynamic path detection
 * @param {Object|null} outputChannel - Optional VS Code output channel for logging
 * @returns {Array<string>} Array of Cline data directory paths
 */
function findClineDirectories(ideHint = null, extensionContext = null, outputChannel = null) {
    const directories = [];
    const homeDir = os.homedir();
    const currentIDE = ideHint || detectCurrentIDE();
    
    const message = `Detecting IDE: ${currentIDE}`;
    if (outputChannel) outputChannel.appendLine(message);
    else console.log(message);
    let possiblePaths = [];
    
    // If we have extension context, try to detect custom user data directory
    if (extensionContext && extensionContext.globalStorageUri) {
        try {
            // The globalStorageUri gives us the path to the extension's global storage
            // Check all supported Cline extension IDs
            for (const extensionId of CLINE_EXTENSION_IDS) {
                const globalStoragePath = extensionContext.globalStorageUri.fsPath;
                const userGlobalStorageDir = path.dirname(globalStoragePath);
                const extensionPath = path.join(userGlobalStorageDir, extensionId);
                const tasksDir = path.join(extensionPath, 'tasks');
                
                if (fs.existsSync(extensionPath) && fs.existsSync(tasksDir)) {
                    directories.push(extensionPath);
                    const friendlyName = getExtensionFriendlyName(extensionId);
                    const message = `Found ${friendlyName} directory via extension context: ${extensionPath}`;
                    if (outputChannel) outputChannel.appendLine(message);
                    else console.log(message);
                }
            }
            
            if (directories.length > 0) {
                return directories; // Return early with found paths
            }
        } catch (error) {
            const message = `Could not use extension context for Cline directory detection: ${error.message}`;
            if (outputChannel) outputChannel.appendLine(`WARNING: ${message}`);
            else console.warn('Warning:', message);
            // Fall back to default paths if extension context fails
        }
    }

    // Get platform-specific base directories
    const platform = os.platform();
    let appDataDir, configDir;

    if (platform === 'win32') {
        // Windows paths
        appDataDir = path.join(homeDir, 'AppData', 'Roaming');
        configDir = appDataDir;
    } else if (platform === 'darwin') {
        // macOS paths
        appDataDir = path.join(homeDir, 'Library', 'Application Support');
        configDir = appDataDir;
    } else {
        // Linux/Unix paths
        appDataDir = path.join(homeDir, '.config');
        configDir = appDataDir;
    }

    // Build paths for all supported Cline extension IDs
    for (const extensionId of CLINE_EXTENSION_IDS) {
        if (currentIDE === 'cursor') {
            // Cursor-specific paths for all platforms
            possiblePaths.push(
                path.join(appDataDir, 'Cursor', 'User', 'globalStorage', extensionId),
                path.join(homeDir, '.cursor', 'User', 'globalStorage', extensionId)
            );
        } else {
            // VS Code-specific paths for all platforms
            possiblePaths.push(
                path.join(appDataDir, 'Code', 'User', 'globalStorage', extensionId),
                path.join(homeDir, '.vscode', 'User', 'globalStorage', extensionId)
            );
        }
    }


    for (const dirPath of possiblePaths) {
        try {
            if (fs.existsSync(dirPath)) {
                const tasksDir = path.join(dirPath, 'tasks');
                if (fs.existsSync(tasksDir)) {
                    directories.push(dirPath);
                    // Extract extension ID from path to show friendly name
                    const extensionId = CLINE_EXTENSION_IDS.find(id => dirPath.includes(id));
                    const friendlyName = extensionId ? getExtensionFriendlyName(extensionId) : 'Cline';
                    const message = `Found ${friendlyName} directory: ${dirPath}`;
                    if (outputChannel) outputChannel.appendLine(message);
                    else console.log(message);
                }
            }
        } catch (error) {
            // Ignore errors and continue checking other paths
        }
    }
    
    return directories;
}

/**
 * Get all Cline tasks from all found directories
 * @param {Object|null} extensionContext - Optional VS Code extension context for dynamic path detection
 * @param {Object|null} outputChannel - Optional VS Code output channel for logging
 * @returns {Array<Object>} Array of task objects with metadata
 */
function getAllClineTasks(extensionContext = null, outputChannel = null) {
    const directories = findClineDirectories(null, extensionContext, outputChannel);
    const allTasks = [];
    
    for (const baseDir of directories) {
        const tasksDir = path.join(baseDir, 'tasks');
        
        try {
            const taskIds = fs.readdirSync(tasksDir);
            
            for (const taskId of taskIds) {
                const taskPath = path.join(tasksDir, taskId);
                const stats = fs.statSync(taskPath);
                
                if (stats.isDirectory()) {
                    // Check if required files exist (more lenient - only require ui_messages OR task_metadata)
                    const uiMessagesPath = path.join(taskPath, 'ui_messages.json');
                    const apiConversationPath = path.join(taskPath, 'api_conversation_history.json');
                    const taskMetadataPath = path.join(taskPath, 'task_metadata.json');
                    
                    // Accept task if it has ui_messages.json OR task_metadata.json (at minimum)
                    const hasUiMessages = fs.existsSync(uiMessagesPath);
                    const hasTaskMetadata = fs.existsSync(taskMetadataPath);
                    
                    if (hasUiMessages || hasTaskMetadata) {
                        allTasks.push({
                            taskId,
                            taskPath,
                            baseDir,
                            lastModified: stats.mtime
                        });
                    }
                }
            }
        } catch (error) {
            const message = `Could not read Cline tasks from ${tasksDir}: ${error.message}`;
            if (outputChannel) outputChannel.appendLine(`WARNING: ${message}`);
            else console.warn('Warning:', message);
        }
    }
    
    // Sort by last modified time (most recent first)
    return allTasks.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * Extract data from a specific Cline task
 * @param {string} taskId - The task ID to extract
 * @param {string|null} baseDir - Base directory containing the task
 * @param {Object|null} extensionContext - Optional VS Code extension context for dynamic path detection
 * @param {Object|null} outputChannel - Optional VS Code output channel for logging
 * @returns {Object|null} Extracted task data or null if not found
 */
function extractClineTask(taskId, baseDir = null, extensionContext = null, outputChannel = null) {
    const directories = baseDir ? [baseDir] : findClineDirectories(null, extensionContext, outputChannel);
    
    for (const dir of directories) {
        const taskPath = path.join(dir, 'tasks', taskId);
        
        if (fs.existsSync(taskPath)) {
            try {
                const uiMessagesPath = path.join(taskPath, 'ui_messages.json');
                const apiConversationPath = path.join(taskPath, 'api_conversation_history.json');
                const taskMetadataPath = path.join(taskPath, 'task_metadata.json');
                
                const uiMessages = fs.existsSync(uiMessagesPath) 
                    ? parseJSONSafely(uiMessagesPath, [], outputChannel, taskId)
                    : [];
                
                const apiConversation = fs.existsSync(apiConversationPath)
                    ? parseJSONSafely(apiConversationPath, [], outputChannel, taskId)
                    : [];
                
                const taskMetadata = fs.existsSync(taskMetadataPath)
                    ? parseJSONSafely(taskMetadataPath, {}, outputChannel, taskId)
                    : {};
                
                return {
                    taskId,
                    taskPath,
                    baseDir: dir,
                    uiMessages,
                    apiConversation,
                    taskMetadata,
                    timestamp: parseInt(taskId) // Task ID appears to be a timestamp
                };
            } catch (error) {
                const message = `Error reading Cline task ${taskId}: ${error.message}`;
                if (outputChannel) outputChannel.appendLine(`ERROR: ${message}`);
                else console.error(message);
                return null;
            }
        }
    }
    
    return null;
}

/**
 * Get recent Cline conversations for selection
 * @param {number} limit - Maximum number of conversations to return
 * @param {Object|null} extensionContext - Optional VS Code extension context for dynamic path detection
 * @param {Object|null} outputChannel - Optional VS Code output channel for logging
 * @returns {Array<Object>} Array of conversation summaries
 */
function getRecentClineConversations(limit = 20, extensionContext = null, outputChannel = null) {
    const allTasks = getAllClineTasks(extensionContext, outputChannel);
    const conversations = [];
    
    for (const task of allTasks.slice(0, limit)) {
        try {
            const taskData = extractClineTask(task.taskId, task.baseDir, extensionContext, outputChannel);
            if (taskData) {
                // Get the first user message as title/summary (handle empty uiMessages gracefully)
                const firstUserMessage = taskData.uiMessages?.find(msg => msg.say === 'text');
                const title = firstUserMessage ? 
                    firstUserMessage.text.substring(0, 100) + '...' : 
                    `Task ${task.taskId}`;
                
                // Extract model information
                const modelInfo = taskData.taskMetadata?.model_usage?.[0];
                const modelName = modelInfo?.model_id || 'Unknown Model';
                
                // Determine which extension this task belongs to based on baseDir
                const extensionId = CLINE_EXTENSION_IDS.find(id => task.baseDir.includes(id)) || 'unknown';
                
                conversations.push({
                    id: task.taskId,
                    title,
                    timestamp: task.lastModified,
                    messageCount: taskData.uiMessages?.length || 0,
                    model: modelName,
                    baseDir: task.baseDir,
                    extensionId
                });
            }
        } catch (error) {
            const message = `Could not process Cline task ${task.taskId}: ${error.message}`;
            if (outputChannel) outputChannel.appendLine(`WARNING: ${message}`);
            else console.warn('Warning:', message);
        }
    }
    
    return conversations;
}

module.exports = {
    CLINE_EXTENSION_IDS,
    getExtensionFriendlyName,
    detectCurrentIDE,
    findClineDirectories,
    getAllClineTasks,
    extractClineTask,
    getRecentClineConversations
};

// saoudrizwan.claude-dev