const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { isAuthenticated } = require('../middleware/auth');

// Define the scripts needed for the React app - removed Lucide and using development React for better errors
const scriptTags = `
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
`;

// SVG icons definitions
const svgIcons = `
<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
  <symbol id="icon-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </symbol>
  <symbol id="icon-alert-triangle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </symbol>
  <symbol id="icon-x-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="15" y1="9" x2="9" y2="15"></line>
    <line x1="9" y1="9" x2="15" y2="15"></line>
  </symbol>
  <symbol id="icon-refresh-cw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </symbol>
  <symbol id="icon-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </symbol>
</svg>
`;

// Helper function to render an SVG icon 
function getSvgIconScript() {
  return `
// Helper function to create SVG icon elements
function SvgIcon({ id, className = "" }) {
  return React.createElement('svg', { 
    className: className,
    width: 24,
    height: 24
  }, React.createElement('use', { xlinkHref: '#icon-' + id }));
}

// Create icon components
const SearchIcon = (props) => SvgIcon({ id: 'search', ...props });
const AlertTriangleIcon = (props) => SvgIcon({ id: 'alert-triangle', ...props });
const XCircleIcon = (props) => SvgIcon({ id: 'x-circle', ...props });
const RefreshCwIcon = (props) => SvgIcon({ id: 'refresh-cw', ...props });
const PlayIcon = (props) => SvgIcon({ id: 'play', ...props });
`;
}

// Log files to show in the logs page
const LOG_FILES = [
  { name: 'Application Logs', path: 'combined.log' },
  { name: 'Error Logs', path: 'error.log' },
  { name: 'Email Logs', path: 'email.log' }
];

/**
 * GET /logs - Render logs page using main layout
 */
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Check for logs directory and use absolute paths if available
    const possibleLogPaths = [
      process.cwd(), // Current directory
      path.join(process.cwd(), 'logs'), // logs subdirectory
      path.join(process.cwd(), 'src', 'logs') // src/logs subdirectory
    ];

    // Filter to available log files only
    const availableLogs = [];

    for (const file of LOG_FILES) {
      let found = false;

      // Try each possible location
      for (const basePath of possibleLogPaths) {
        const fullPath = path.join(basePath, file.path);
        try {
          await fs.access(fullPath);
          // File exists at this location
          availableLogs.push({
            name: file.name,
            path: fullPath, // Use absolute path
            displayPath: file.path // Keep original name for display
          });
          found = true;
          break;
        } catch (err) {
          // File doesn't exist at this location, continue to next
        }
      }

      // If file wasn't found in any location but is one of the main logs, add it anyway
      if (!found && (file.path === 'combined.log' || file.path === 'error.log')) {
        availableLogs.push({
          name: file.name,
          path: file.path,
          displayPath: file.path,
          warning: 'File not found, will be created when logs are generated'
        });
      }
    }

    // Get the latest logs from each file (last 50 lines)
    const logs = await Promise.all(
      availableLogs.map(async (file) => {
        try {
          const content = await fs.readFile(file.path, 'utf8');
          // Split into lines, filter empty lines, take last 50, and reverse to show newest first
          const allLines = content.split('\n').filter(Boolean);
          const lines = allLines.slice(-50).reverse();
          return {
            name: file.name,
            path: file.displayPath || file.path, // Use display path for frontend
            lines: lines
          };
        } catch (err) {
          logger.warn(`Log file ${file.path} not available: ${err.message}`);
          return {
            name: file.name,
            path: file.displayPath || file.path,
            lines: [],
            warning: file.warning || `Log file not found or empty. It will be created when events occur.`
          };
        }
      })
    );

    res.render('logs', {
      title: 'Logs - WhatsApp Bot Admin',
      user: req.session.user,
      activeTab: 'logs',
      logs: logs
    });
  } catch (error) {
    logger.error('Error serving log viewer:', error);
    res.status(500).render('error', {
      error: {
        status: 500,
        message: 'Failed to load logs',
        description: error.message
      }
    });
  }
});

/**
 * GET /logs/api/:file - API endpoint to get log data
 */
router.get('/api/:file', isAuthenticated, async (req, res) => {
  const fileName = req.params.file;
  const lines = parseInt(req.query.lines) || 100;
  
  // Validate filename to prevent directory traversal
  const validFiles = LOG_FILES.map(file => file.path);
  if (!validFiles.includes(fileName)) {
    return res.status(400).json({ error: 'Invalid log file' });
  }
  
  try {
    // Check if file exists
    try {
      await fs.access(fileName);
    } catch (err) {
      // File doesn't exist, try in logs directory
      const possiblePaths = [
        path.join(process.cwd(), 'logs', fileName),
        path.join(process.cwd(), 'src', 'logs', fileName)
      ];
      
      let found = false;
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          // File found, replace fileName with absolute path
          fileName = possiblePath;
          found = true;
          break;
        } catch (err) {
          // Continue to next path
        }
      }
      
      if (!found) {
        // Return empty log if file doesn't exist
        logger.warn(`Log file ${fileName} not found in any location, returning empty log`);
        return res.json({
          file: fileName,
          lines: [],
          warning: `Log file doesn't exist yet. It will be created when relevant events occur.`
        });
      }
    }
    
    const content = await fs.readFile(fileName, 'utf8');
    const logLines = content.split('\n').filter(Boolean).slice(-lines);
    
    // Parse log lines into structured data if possible
    const parsedLines = logLines.map(line => {
      try {
        // Try to parse as JSON first
        if (line.includes('{"service":')) {
          const parts = line.split(' ');
          const timestamp = parts[0];
          const message = parts.slice(1).join(' ');
          const jsonStart = message.indexOf('{');
          
          if (jsonStart !== -1) {
            const messageText = message.substring(0, jsonStart).trim();
            const jsonData = JSON.parse(message.substring(jsonStart));
            
            return {
              timestamp,
              message: messageText,
              data: jsonData,
              raw: line
            };
          }
        }
        
        // Fall back to simple parsing
        if (line.includes(' - ')) {
          const [timestamp, message] = line.split(' - ');
          return {
            timestamp,
            message,
            raw: line
          };
        }
        
        return { raw: line };
      } catch (err) {
        return { raw: line };
      }
    });
    
    res.json({
      file: fileName,
      lines: parsedLines
    });
  } catch (error) {
    logger.error(`Error reading log file ${fileName}:`, error);
    res.status(500).json({ error: `Failed to read log file: ${error.message}` });
  }
});

module.exports = router; 