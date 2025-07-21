const fs = require('fs');
const path = require('path');
const os = require('os');

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
 * @param {string} ideHint - Optional IDE hint ('cursor' or 'vscode')
 * @returns {Array<string>} Array of Cline data directory paths
 */
function findClineDirectories(ideHint = null) {
    const directories = [];
    const homeDir = os.homedir();
    const currentIDE = ideHint || detectCurrentIDE();
    
    console.log(`Detecting IDE: ${currentIDE}`);
    let possiblePaths = [];
    
    if (currentIDE === 'cursor') {
        // Cursor-specific paths
        possiblePaths = [
            path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'xai.grok-dev'),
            path.join(homeDir, '.cursor', 'User', 'globalStorage', 'xai.grok-dev'),
        ];
    } else {
        // VS Code-specific paths  
        possiblePaths = [
            path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'xai.grok-dev'),
            path.join(homeDir, '.vscode', 'User', 'globalStorage', 'xai.grok-dev'),
        ];
    }
    
    // Also check for custom user data directories
    const customDataDir = process.env.VSCODE_USER_DATA_DIR;
    if (customDataDir) {
        possiblePaths.push(path.join(customDataDir, 'User', 'globalStorage', 'xai.grok-dev'));
    }
    
    for (const dirPath of possiblePaths) {
        try {
            if (fs.existsSync(dirPath)) {
                const tasksDir = path.join(dirPath, 'tasks');
                if (fs.existsSync(tasksDir)) {
                    directories.push(dirPath);
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
 * @returns {Array<Object>} Array of task objects with metadata
 */
function getAllClineTasks() {
    const directories = findClineDirectories();
    const allTasks = [];
    
    for (const baseDir of directories) {
        const tasksDir = path.join(baseDir, 'tasks');
        
        try {
            const taskIds = fs.readdirSync(tasksDir);
            
            for (const taskId of taskIds) {
                const taskPath = path.join(tasksDir, taskId);
                const stats = fs.statSync(taskPath);
                
                if (stats.isDirectory()) {
                    // Check if required files exist
                    const uiMessagesPath = path.join(taskPath, 'ui_messages.json');
                    const apiConversationPath = path.join(taskPath, 'api_conversation_history.json');
                    const taskMetadataPath = path.join(taskPath, 'task_metadata.json');
                    
                    if (fs.existsSync(uiMessagesPath) && fs.existsSync(apiConversationPath) && fs.existsSync(taskMetadataPath)) {
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
            console.warn(`Warning: Could not read Cline tasks from ${tasksDir}:`, error.message);
        }
    }
    
    // Sort by last modified time (most recent first)
    return allTasks.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * Extract data from a specific Cline task
 * @param {string} taskId - The task ID to extract
 * @param {string} baseDir - Base directory containing the task
 * @returns {Object|null} Extracted task data or null if not found
 */
function extractClineTask(taskId, baseDir = null) {
    const directories = baseDir ? [baseDir] : findClineDirectories();
    
    for (const dir of directories) {
        const taskPath = path.join(dir, 'tasks', taskId);
        
        if (fs.existsSync(taskPath)) {
            try {
                const uiMessagesPath = path.join(taskPath, 'ui_messages.json');
                const apiConversationPath = path.join(taskPath, 'api_conversation_history.json');
                const taskMetadataPath = path.join(taskPath, 'task_metadata.json');
                
                const uiMessages = fs.existsSync(uiMessagesPath) 
                    ? JSON.parse(fs.readFileSync(uiMessagesPath, 'utf8'))
                    : [];
                
                const apiConversation = fs.existsSync(apiConversationPath)
                    ? JSON.parse(fs.readFileSync(apiConversationPath, 'utf8'))
                    : [];
                
                const taskMetadata = fs.existsSync(taskMetadataPath)
                    ? JSON.parse(fs.readFileSync(taskMetadataPath, 'utf8'))
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
                console.error(`Error reading Cline task ${taskId}:`, error.message);
                return null;
            }
        }
    }
    
    return null;
}

/**
 * Get recent Cline conversations for selection
 * @param {number} limit - Maximum number of conversations to return
 * @returns {Array<Object>} Array of conversation summaries
 */
function getRecentClineConversations(limit = 20) {
    const allTasks = getAllClineTasks();
    const conversations = [];
    
    for (const task of allTasks.slice(0, limit)) {
        try {
            const taskData = extractClineTask(task.taskId, task.baseDir);
            if (taskData) {
                // Get the first user message as title/summary
                const firstUserMessage = taskData.uiMessages.find(msg => msg.say === 'text');
                const title = firstUserMessage ? firstUserMessage.text.substring(0, 100) + '...' : `Task ${task.taskId}`;
                
                // Extract model information
                const modelInfo = taskData.taskMetadata?.model_usage?.[0];
                const modelName = modelInfo?.model_id || 'Unknown Model';
                
                conversations.push({
                    id: task.taskId,
                    title,
                    timestamp: task.lastModified,
                    messageCount: taskData.uiMessages.length,
                    model: modelName,
                    baseDir: task.baseDir
                });
            }
        } catch (error) {
            console.warn(`Warning: Could not process Cline task ${task.taskId}:`, error.message);
        }
    }
    
    return conversations;
}

module.exports = {
    findClineDirectories,
    getAllClineTasks,
    extractClineTask,
    getRecentClineConversations
};