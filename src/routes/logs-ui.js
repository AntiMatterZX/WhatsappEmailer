const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

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

// Serve the log viewer page
router.get('/', async (req, res) => {
  try {
    // Read the React component
    const componentPath = path.join(__dirname, '../public/log-viewer-component.js');
    let componentCode;
    
    try {
      componentCode = await fs.readFile(componentPath, 'utf8');
    } catch (err) {
      // Use a default component if file doesn't exist
      logger.error('Could not load log viewer component:', err);
      componentCode = `
// Placeholder component if file doesn't exist
function LogViewer() {
  return React.createElement('div', null, 'Loading log viewer...');
}
      `;
    }
    
    // Render HTML with React
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Bot - Log Viewer</title>
  ${scriptTags}
  <style>
    body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    #root {
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  
  <!-- SVG Icon Definitions -->
  ${svgIcons}
  
  <script>
    // Utility function for class names
    const cn = (...classes) => classes.filter(Boolean).join(' ');
    
    ${getSvgIconScript()}
    
    // --- BEGIN COMPONENT CODE ---
    ${componentCode.replace(/const cn = \(.*?\) => .*?;/gs, '')}
    // --- END COMPONENT CODE ---
    
    // Initialize the app
    document.addEventListener('DOMContentLoaded', function() {
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(LogViewer));
    });
  </script>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    logger.error('Error serving log viewer:', error);
    res.status(500).send('Error loading log viewer');
  }
});

module.exports = router; 