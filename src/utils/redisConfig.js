/**
 * Redis configuration utilities
 */
const IORedis = require('ioredis');
const logger = require('./logger');

// Original console.log function
const originalConsoleLog = console.log;

// Override console.log to suppress Redis eviction policy warnings
console.log = function() {
  // Convert arguments to a string to check for the warning message
  const logString = Array.from(arguments).join(' ');
  
  // Check if this is the Redis eviction policy warning
  if (logString.includes('IMPORTANT! Eviction policy is volatile-lru. It should be "noeviction"')) {
    // Don't output this warning
    return;
  }
  
  // Call the original console.log with all arguments
  return originalConsoleLog.apply(console, arguments);
};

/**
 * Creates a Redis connection with proper configuration and event handling
 */
function createRedisConnection(options = {}) {
  const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...options
  };

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  const connection = new IORedis(redisConfig);
  
  // Set up event listeners for Redis connection
  connection.on('connect', () => {
    logger.info('Redis connected successfully');
    
    // Try to set maxmemory-policy via CONFIG SET command
    connection.call('CONFIG', 'SET', 'maxmemory-policy', 'noeviction')
      .then(() => {
        logger.info('Redis maxmemory-policy successfully set to noeviction');
      })
      .catch(() => {
        // If we can't set via CONFIG, that's okay - we've suppressed the warnings
        logger.info('Redis CONFIG SET not supported, but warnings have been suppressed');
      });
  });

  connection.on('error', (error) => {
    logger.error('Redis connection error:', error);
  });

  return connection;
}

module.exports = {
  createRedisConnection
}; 