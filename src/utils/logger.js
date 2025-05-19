const winston = require('winston');
const { format } = winston;

// Custom format for console output that's more concise
const consoleFormat = format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'whatsapp-bot' },
  transports: [
    // Write all errors to error.log
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: 'combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  ],
  // Don't exit on uncaught exceptions
  exitOnError: false
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: format.combine(
      format.colorize(),
      format.timestamp({ format: 'HH:mm:ss' }),
      consoleFormat
    )
  }));
} else {
  // Add more limited console output in production
  logger.add(new winston.transports.Console({
    level: 'warn', // Only warnings and errors in production console
    format: format.combine(
      format.colorize(),
      format.timestamp({ format: 'HH:mm:ss' }),
      consoleFormat
    )
  }));
}

// Filter out specific BullMQ deprecation warnings
const originalWarn = console.warn;
console.warn = function(message) {
  if (typeof message === 'string' && 
     (message.includes('BullMQ: DEPRECATION WARNING') || 
      message.includes('maxRetriesPerRequest must be null'))) {
    // Suppress these specific warnings
    return;
  }
  originalWarn.apply(console, arguments);
};

module.exports = logger; 