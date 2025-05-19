// Utility function for class names
const cn = (...classes) => classes.filter(Boolean).join(' ');

// Typing for our logs from whatsapp-bot system
const LOG_LEVELS = {
  ERROR: "ERROR",
  WARN: "WARNING", 
  INFO: "INFO",
  DEBUG: "DEBUG"
};

// HTTP methods we might see in logs
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

// Convert WhatsApp bot log format to the component's format
function convertLogFormat(rawLog) {
  try {
    // If it's already an object (from SSE), use it directly
    const logData = typeof rawLog === 'string' ? JSON.parse(rawLog) : rawLog;
    
    // Extract HTTP method and path if message contains them
    let method = null;
    let path = null;
    let host = "whatsapp-bot";
    let statusCode = 200;
    
    // Try to extract HTTP information from message
    if (logData.message) {
      // Check for HTTP method patterns in the message
      for (const m of HTTP_METHODS) {
        if (logData.message.includes(` ${m} `)) {
          method = m;
          
          // Try to extract path
          const parts = logData.message.split(` ${m} `);
          if (parts.length > 1) {
            const pathMatch = parts[1].match(/([^\s]+)/);
            if (pathMatch) path = pathMatch[0];
          }
          
          break;
        }
      }
      
      // Check for status codes
      const statusMatch = logData.message.match(/status(?:Code)?: ?(\d{3})/i);
      if (statusMatch) {
        statusCode = parseInt(statusMatch[1]);
      }
    }
    
    // Default method if none found
    if (!method) {
      method = "INFO";
    }
    
    // Default path if none found
    if (!path) {
      if (logData.message?.includes('WhatsApp')) {
        path = "/whatsapp";
      } else if (logData.message?.includes('MongoDB')) {
        path = "/database";
      } else if (logData.message?.includes('Redis')) {
        path = "/cache";
      } else {
        path = "/system";
      }
    }
    
    // Map level
    let level = LOG_LEVELS.INFO;
    if (logData.level) {
      const upperLevel = logData.level.toUpperCase();
      if (upperLevel === 'ERROR') level = LOG_LEVELS.ERROR;
      else if (upperLevel === 'WARN' || upperLevel === 'WARNING') level = LOG_LEVELS.WARN;
      else if (upperLevel === 'DEBUG') level = LOG_LEVELS.DEBUG;
    }
    
    // If error contains status code 4xx or 5xx, adjust level
    if (statusCode >= 400 && statusCode < 500) level = LOG_LEVELS.WARN;
    if (statusCode >= 500) level = LOG_LEVELS.ERROR;
    
    return {
      id: logData.timestamp + Math.random().toString(36).substring(2, 9),
      timestamp: formatTimestamp(logData.timestamp),
      method: method,
      statusCode: statusCode,
      host: logData.service || host,
      path: path,
      message: logData.message || "",
      level: level,
      rawLog: logData // Keep the original for reference
    };
  } catch (e) {
    // If parsing fails, create a fallback log entry
    return {
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      timestamp: formatTimestamp(new Date().toISOString()),
      method: "INFO",
      statusCode: 200,
      host: "whatsapp-bot",
      path: "/unknown",
      message: typeof rawLog === 'string' ? rawLog : JSON.stringify(rawLog),
      level: LOG_LEVELS.INFO,
      rawLog: rawLog
    };
  }
}

// Format timestamp from ISO to a more readable format
function formatTimestamp(isoTimestamp) {
  if (!isoTimestamp) return new Date().toLocaleString();
  
  try {
    const date = new Date(isoTimestamp);
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(2, '0');
    
    return `${month} ${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  } catch (e) {
    return isoTimestamp;
  }
}

function LogViewer() {
  const [logs, setLogs] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isLive, setIsLive] = React.useState(false);
  const [selectedLogFile, setSelectedLogFile] = React.useState("combined.log");
  const [logFiles, setLogFiles] = React.useState([]);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [limit, setLimit] = React.useState(100);
  const timelineRef = React.useRef(null);
  const eventSourceRef = React.useRef(null);

  // Fetch available log files
  React.useEffect(() => {
    fetch('/api/logs')
      .then(response => response.json())
      .then(data => {
        if (data.logs && Array.isArray(data.logs)) {
          setLogFiles(data.logs);
        }
      })
      .catch(error => console.error('Failed to fetch log files:', error));
  }, []);

  // Fetch logs
  React.useEffect(() => {
    if (!isLive) {
      fetchLogs(selectedLogFile, currentPage, limit);
    }
  }, [selectedLogFile, currentPage, limit, isLive]);

  // Handle live streaming
  React.useEffect(() => {
    if (isLive) {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      // Open new SSE connection
      const eventSource = new EventSource(`/api/logs/${selectedLogFile}/stream`);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const formattedLog = convertLogFormat(data);
          
          setLogs(prevLogs => {
            // Add new log at the beginning
            const newLogs = [formattedLog, ...prevLogs];
            // Limit to avoid memory issues
            if (newLogs.length > 1000) {
              return newLogs.slice(0, 1000);
            }
            return newLogs;
          });
        } catch (error) {
          console.error('Error processing SSE data:', error);
        }
      };
      
      eventSource.onerror = () => {
        console.error('SSE connection error');
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (isLive) {
            setIsLive(false);
            setIsLive(true);
          }
        }, 5000);
      };
      
      // Cleanup
      return () => {
        eventSource.close();
        eventSourceRef.current = null;
      };
    }
  }, [isLive, selectedLogFile]);

  // Fetch logs from API
  const fetchLogs = (filename, page, pageLimit) => {
    fetch(`/api/logs/${filename}?page=${page}&limit=${pageLimit}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        setTotalPages(data.totalPages || 1);
        
        // Convert logs to our format
        const formattedLogs = (data.lines || []).map(convertLogFormat);
        setLogs(formattedLogs);
      })
      .catch(error => {
        console.error('Error fetching logs:', error);
        setLogs([]);
      });
  };

  // Handle log file change
  const handleLogFileChange = (e) => {
    const newLogFile = e.target.value;
    setSelectedLogFile(newLogFile);
    setCurrentPage(1);
    
    if (isLive) {
      // Reset live connection
      setIsLive(false);
      setTimeout(() => setIsLive(true), 100);
    }
  };

  // Toggle live mode
  const toggleLive = () => {
    setIsLive(!isLive);
  };

  // Clear logs
  const clearLogs = () => {
    fetch(`/api/logs/${selectedLogFile}/clear`, {
      method: 'POST'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(() => {
        setLogs([]);
        setCurrentPage(1);
        setTotalPages(1);
      })
      .catch(error => {
        console.error('Error clearing logs:', error);
      });
  };

  // Refresh logs
  const refreshLogs = () => {
    if (!isLive) {
      fetchLogs(selectedLogFile, currentPage, limit);
    }
  };

  // Filter logs based on search query
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;

    return (
      log.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.timestamp.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Get color for status code
  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return "text-green-500";
    if (status >= 400 && status < 500) return "text-amber-500";
    if (status >= 500) return "text-red-500";
    return "text-white";
  };

  // Get background color for row based on log level
  const getRowBackground = (level) => {
    if (level === LOG_LEVELS.WARN) return "bg-amber-950/50 border-l-4 border-amber-500";
    if (level === LOG_LEVELS.ERROR) return "bg-red-950/50 border-l-4 border-red-500";
    return "";
  };

  // Get icon for log level
  const getStatusIcon = (level) => {
    if (level === LOG_LEVELS.WARN) return React.createElement(AlertTriangleIcon, { className: "w-4 h-4 text-amber-500" });
    if (level === LOG_LEVELS.ERROR) return React.createElement(XCircleIcon, { className: "w-4 h-4 text-red-500" });
    return null;
  };

  return React.createElement(
    "div",
    { className: "flex flex-col h-screen bg-black text-gray-300 font-mono text-sm" },
    
    // Header
    React.createElement(
      "div",
      { className: "flex items-center p-2 border-b border-gray-800" },
      
      // Left controls
      React.createElement(
        "div",
        { className: "flex space-x-2" },
        
        // Clear button
        React.createElement(
          "button",
          { 
            className: "p-2 rounded-md hover:bg-gray-800",
            onClick: clearLogs,
            title: "Clear logs"
          },
          React.createElement(XCircleIcon, { className: "w-5 h-5" })
        ),
        
        // Log file selector
        React.createElement(
          "select",
          {
            value: selectedLogFile,
            onChange: handleLogFileChange,
            className: "bg-gray-900 border border-gray-700 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-600"
          },
          logFiles.map(file => React.createElement(
            "option",
            { key: file.name, value: file.name },
            `${file.name} (${Math.round(file.size / 1024)}KB)`
          ))
        ),
        
        // Line limit selector
        React.createElement(
          "select",
          {
            value: limit,
            onChange: (e) => setLimit(Number(e.target.value)),
            className: "bg-gray-900 border border-gray-700 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-600",
            disabled: isLive
          },
          [50, 100, 200, 500].map(value => React.createElement(
            "option",
            { key: value, value },
            `${value} lines`
          ))
        )
      ),
      
      // Search bar
      React.createElement(
        "div",
        { className: "flex-1 mx-2 relative" },
        React.createElement(SearchIcon, { className: "absolute left-3 top-2.5 w-4 h-4 text-gray-500" }),
        React.createElement(
          "input",
          {
            type: "text",
            placeholder: "Search logs...",
            className: "w-full bg-gray-900 border border-gray-700 rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-1 focus:ring-gray-600",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value)
          }
        )
      ),
      
      // Right controls
      React.createElement(
        "div",
        { className: "flex items-center space-x-2" },
        
        // Live toggle button
        React.createElement(
          "button",
          {
            className: cn(
              "flex items-center gap-2 px-4 py-2 rounded-md border border-gray-700",
              isLive ? "bg-blue-900/50 text-blue-400 border-blue-700" : "hover:bg-gray-800"
            ),
            onClick: toggleLive
          },
          React.createElement("span", { 
            className: cn("w-2 h-2 rounded-full", isLive ? "bg-blue-400" : "bg-gray-400") 
          }),
          "Live"
        ),
        
        // Refresh button
        React.createElement(
          "button",
          {
            className: "p-2 rounded-md hover:bg-gray-800",
            onClick: refreshLogs,
            disabled: isLive
          },
          React.createElement(RefreshCwIcon, { className: "w-5 h-5" })
        ),
        
        // Pagination controls (when not in live mode)
        !isLive && React.createElement(
          "div",
          { className: "flex items-center space-x-1" },
          
          // Previous page button
          React.createElement(
            "button",
            {
              className: "p-1 rounded-md hover:bg-gray-800 disabled:opacity-50",
              onClick: () => setCurrentPage(prev => Math.max(prev - 1, 1)),
              disabled: currentPage <= 1
            },
            "← Prev"
          ),
          
          // Page indicator
          React.createElement("span", { className: "px-2" }, `${currentPage} / ${totalPages}`),
          
          // Next page button
          React.createElement(
            "button",
            {
              className: "p-1 rounded-md hover:bg-gray-800 disabled:opacity-50",
              onClick: () => setCurrentPage(prev => Math.min(prev + 1, totalPages)),
              disabled: currentPage >= totalPages
            },
            "Next →"
          )
        )
      )
    ),
    
    // Table header
    React.createElement(
      "div",
      { className: "grid grid-cols-12 gap-2 py-2 px-4 border-b border-gray-800 text-gray-500" },
      React.createElement("div", { className: "col-span-2" }, "Time"),
      React.createElement("div", { className: "col-span-1" }, "Status"),
      React.createElement("div", { className: "col-span-2" }, "Service"),
      React.createElement("div", { className: "col-span-3" }, "Path"),
      React.createElement("div", { className: "col-span-4" }, "Message")
    ),
    
    // Log entries
    React.createElement(
      "div",
      { className: "flex-1 overflow-auto" },
      filteredLogs.length === 0 
        ? React.createElement("div", { className: "text-center py-10 text-gray-500" }, "No logs found")
        : filteredLogs.map(log => React.createElement(
            "div",
            {
              key: log.id,
              className: cn(
                "grid grid-cols-12 gap-2 py-2 px-4 border-b border-gray-800 hover:bg-gray-900/50",
                getRowBackground(log.level)
              )
            },
            
            // Time column with level icon
            React.createElement(
              "div",
              { className: "col-span-2 flex items-center gap-2" },
              getStatusIcon(log.level),
              React.createElement("span", null, log.timestamp)
            ),
            
            // Status column
            React.createElement(
              "div",
              { className: "col-span-1" },
              React.createElement(
                "span",
                { className: "flex items-center gap-1" },
                React.createElement("span", { className: getStatusColor(log.statusCode) }, log.method),
                React.createElement("span", { className: getStatusColor(log.statusCode) }, log.statusCode)
              )
            ),
            
            // Service column
            React.createElement("div", { className: "col-span-2 truncate" }, log.host),
            
            // Path column
            React.createElement(
              "div",
              { className: "col-span-3 flex items-center gap-2" },
              React.createElement(
                "span",
                { className: "inline-flex items-center justify-center w-5 h-5 bg-gray-800 rounded text-xs" },
                "ƒ"
              ),
              React.createElement("span", { className: "truncate" }, log.path)
            ),
            
            // Message column
            React.createElement(
              "div",
              { className: "col-span-4 truncate" },
              log.message && React.createElement(
                "span",
                { 
                  className: log.level === LOG_LEVELS.ERROR ? "text-red-400" : 
                            log.level === LOG_LEVELS.WARN ? "text-amber-400" : "" 
                },
                log.message
              )
            )
          )
      )
    ),
    
    // Live mode footer
    isLive && React.createElement(
      "div",
      { className: "bg-blue-900/30 border-t border-blue-800 py-2 px-4 flex items-center" },
      React.createElement(PlayIcon, { className: "w-4 h-4 text-blue-400 mr-2" }),
      React.createElement("span", { className: "text-blue-400" }, `Live Mode - Streaming ${selectedLogFile}`)
    )
  );
} 