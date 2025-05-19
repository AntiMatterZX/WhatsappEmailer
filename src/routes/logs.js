const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// GET /api/logs - Get a list of available log files
router.get('/', async (req, res) => {
  try {
    const logFiles = ['combined.log', 'error.log', 'monitoring.log', 'routes.log', 'webhook.log'];
    const results = [];
    
    for (const file of logFiles) {
      try {
        const stats = await fs.stat(file);
        results.push({
          name: file,
          size: stats.size,
          modified: stats.mtime
        });
      } catch (error) {
        // File may not exist, just skip it
        logger.debug(`Log file ${file} not found or cannot be accessed`);
      }
    }
    
    res.json({ logs: results });
  } catch (error) {
    logger.error('Failed to retrieve log files:', error);
    res.status(500).json({ error: 'Failed to retrieve log files' });
  }
});

// GET /api/logs/:filename - Get the contents of a specific log file
router.get('/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const allowedLogs = ['combined.log', 'error.log', 'monitoring.log', 'routes.log', 'webhook.log'];
    
    // Security check - only allow specific log files
    if (!allowedLogs.includes(filename)) {
      return res.status(403).json({ error: 'Access denied to this log file' });
    }
    
    // Pagination parameters
    const limit = parseInt(req.query.limit) || 100;  // Default to 100 lines
    const page = parseInt(req.query.page) || 1;      // Default to first page
    const skip = (page - 1) * limit;
    
    // Read the file
    const fileContent = await fs.readFile(filename, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    // Apply pagination - newest logs first
    const totalLines = lines.length;
    
    // Safely extract the lines in reverse order (newest first)
    let paginatedLines = [];
    if (totalLines > 0) {
      // Start from the end of the array (newest logs) and work backwards
      // Calculate safe start and end indices
      const startIdx = Math.max(0, totalLines - skip - limit);
      const endIdx = Math.min(totalLines, totalLines - skip);
      
      // Extract the relevant slice and reverse it
      paginatedLines = lines.slice(startIdx, endIdx).reverse();
    }
    
    res.json({
      filename,
      page,
      limit,
      total: totalLines,
      totalPages: Math.ceil(totalLines / limit),
      lines: paginatedLines
    });
  } catch (error) {
    logger.error(`Failed to read log file ${req.params.filename}:`, error);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Log file not found' });
    }
    res.status(500).json({ error: 'Failed to read log file' });
  }
});

// POST /api/logs/:filename/clear - Clear a specific log file
router.post('/:filename/clear', async (req, res) => {
  try {
    const filename = req.params.filename;
    const allowedLogs = ['combined.log', 'error.log', 'monitoring.log', 'routes.log', 'webhook.log'];
    
    // Security check - only allow specific log files
    if (!allowedLogs.includes(filename)) {
      return res.status(403).json({ error: 'Access denied to this log file' });
    }
    
    // Clear the file by writing an empty string
    await fs.writeFile(filename, '');
    
    logger.info(`Log file ${filename} has been cleared`);
    res.json({ success: true, message: `Log file ${filename} has been cleared` });
  } catch (error) {
    logger.error(`Failed to clear log file ${req.params.filename}:`, error);
    res.status(500).json({ error: 'Failed to clear log file' });
  }
});

// GET /api/logs/:filename/stream - Stream log updates in real-time
router.get('/:filename/stream', (req, res) => {
  try {
    const filename = req.params.filename;
    const allowedLogs = ['combined.log', 'error.log', 'monitoring.log', 'routes.log', 'webhook.log'];
    
    // Security check
    if (!allowedLogs.includes(filename)) {
      return res.status(403).json({ error: 'Access denied to this log file' });
    }
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send an initial event to confirm connection
    res.write(`data: ${JSON.stringify({ type: 'connection', message: 'Connected to log stream' })}\n\n`);
    
    // Create a tail stream
    let lastSize = 0;
    try {
      if (fsSync.existsSync(filename)) {
        const stats = fsSync.statSync(filename);
        lastSize = stats.size;
      } else {
        // If file doesn't exist, start from 0
        lastSize = 0;
      }
    } catch (error) {
      logger.warn(`Error getting file stats for ${filename}: ${error.message}`);
      // If there's an error, start from 0
      lastSize = 0;
    }
    
    // Poll for changes every second
    const interval = setInterval(async () => {
      try {
        if (!fsSync.existsSync(filename)) {
          // If file doesn't exist, reset size
          lastSize = 0;
          return;
        }
        
        const stats = fsSync.statSync(filename);
        if (stats.size > lastSize) {
          // File has grown, read the new part
          try {
            const handle = await fs.open(filename, 'r');
            const buffer = Buffer.alloc(Math.min(stats.size - lastSize, 65536)); // Limit to 64KB
            await handle.read(buffer, 0, buffer.length, lastSize);
            await handle.close();
            
            const newContent = buffer.toString('utf8');
            
            // Send new lines as events
            const lines = newContent.split('\n')
              .filter(line => line.trim() !== '')
              .map(line => {
                try {
                  return JSON.parse(line);
                } catch (e) {
                  return { message: line };
                }
              });
              
            // Process at most 50 new lines at once to prevent overload
            const limitedLines = lines.slice(-50);
            
            for (const line of limitedLines) {
              res.write(`data: ${JSON.stringify(line)}\n\n`);
            }
            
            lastSize = stats.size;
          } catch (fileError) {
            logger.error(`Error reading file ${filename}: ${fileError.message}`);
            // Don't update lastSize to retry next time
          }
        }
      } catch (error) {
        logger.error('Error in log streaming:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Error reading log file' })}\n\n`);
      }
    }, 1000);
    
    // Handle client disconnect
    res.on('close', () => {
      clearInterval(interval);
      res.end();
      logger.debug(`Client disconnected from log stream: ${filename}`);
    });
    
  } catch (error) {
    logger.error(`Failed to stream log file ${req.params.filename}:`, error);
    res.status(500).json({ error: 'Failed to stream log file' });
  }
});

module.exports = router; 