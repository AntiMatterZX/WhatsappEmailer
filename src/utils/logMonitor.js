const logger = require('./logger');
const fs = require('fs');
const path = require('path');

class LogMonitor {
  constructor() {
    this.startTime = new Date();
    this.logCount = {
      error: 0,
      warn: 0,
      info: 0, 
      debug: 0,
      verbose: 0
    };
    this.lastReport = new Date();
    this.reportInterval = 60000; // Report every minute
  }

  trackLog(level) {
    if (this.logCount[level] !== undefined) {
      this.logCount[level]++;
    }

    // Check if it's time to report stats
    const now = new Date();
    if (now - this.lastReport > this.reportInterval) {
      this.reportStats();
      this.lastReport = now;
    }
  }

  reportStats() {
    const uptime = (new Date() - this.startTime) / 1000;
    const totalLogs = Object.values(this.logCount).reduce((sum, count) => sum + count, 0);
    const logsPerSecond = totalLogs / uptime;
    
    if (process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'verbose') {
      logger.debug('Log statistics:', {
        uptime: `${Math.round(uptime)}s`,
        totalLogs,
        logsPerSecond: logsPerSecond.toFixed(2),
        distribution: this.logCount
      });
    }

    // Check for logging issues
    if (logsPerSecond > 100) {
      logger.warn('High logging rate detected', { 
        logsPerSecond: logsPerSecond.toFixed(2)
      });
    }

    // Check log file sizes
    this.checkLogFileSize('error.log');
    this.checkLogFileSize('combined.log');
  }

  checkLogFileSize(filename) {
    try {
      const stats = fs.statSync(filename);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 50) {
        logger.warn(`Log file ${filename} is getting large`, { 
          size: `${fileSizeMB.toFixed(2)}MB` 
        });
      }
    } catch (error) {
      // File may not exist yet, ignore errors
    }
  }

  // Wrap Winston logger to track log counts
  wrapLogger() {
    const originalError = logger.error;
    const originalWarn = logger.warn;
    const originalInfo = logger.info;
    const originalDebug = logger.debug;
    const originalVerbose = logger.verbose;
    const self = this;

    logger.error = function() {
      self.trackLog('error');
      return originalError.apply(this, arguments);
    };

    logger.warn = function() {
      self.trackLog('warn');
      return originalWarn.apply(this, arguments);
    };

    logger.info = function() {
      self.trackLog('info');
      return originalInfo.apply(this, arguments);
    };

    logger.debug = function() {
      self.trackLog('debug');
      return originalDebug.apply(this, arguments);
    };

    logger.verbose = function() {
      self.trackLog('verbose');
      return originalVerbose.apply(this, arguments);
    };
  }
}

const monitor = new LogMonitor();

// Only enable monitoring in non-production or if explicitly requested
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_LOG_MONITOR === 'true') {
  monitor.wrapLogger();
}

module.exports = monitor; 