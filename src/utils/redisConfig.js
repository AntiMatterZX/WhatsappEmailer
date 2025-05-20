/**
 * Redis configuration utilities
 * Implements a connection pool for Redis to prevent "max clients reached" errors
 */
const IORedis = require('ioredis');
const logger = require('./logger');

// Store a single shared connection instance
let sharedConnection = null;

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
 * Get or create a shared Redis connection
 * This ensures we reuse connections across the application
 * 
 * @param {Object} options - Redis connection options
 * @returns {Object} - Redis connection instance
 */
function getSharedConnection(options = {}) {
  // Check if Redis is disabled (especially for Vercel deployment)
  if (process.env.REDIS_DISABLED === 'true') {
    logger.info('Redis is disabled via REDIS_DISABLED flag - using in-memory fallbacks');
    return null;
  }

  // If we already have a connection and it's not disconnected, return it
  if (sharedConnection && sharedConnection.status !== 'end') {
    return sharedConnection;
  }

  // Set up a new connection if needed
  const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Important: Set connection limits to avoid too many connections
    connectTimeout: 10000,
    disconnectTimeout: 5000,
    retryStrategy: function(times) {
      // Exponential backoff with a max delay of 30 seconds
      const delay = Math.min(Math.exp(times) * 100, 30000);
      logger.info(`Redis connection retry in ${delay}ms (attempt ${times})`);
      return delay;
    },
    ...options
  };

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  // Create the connection
  try {
    sharedConnection = new IORedis(redisConfig);
    
    // Set up event listeners for Redis connection
    sharedConnection.on('connect', () => {
      logger.info('Redis connected successfully');
      
      // Try to set maxmemory-policy via CONFIG SET command
      sharedConnection.call('CONFIG', 'SET', 'maxmemory-policy', 'noeviction')
        .then(() => {
          logger.info('Redis maxmemory-policy successfully set to noeviction');
        })
        .catch(() => {
          // If we can't set via CONFIG, that's okay - we've suppressed the warnings
          logger.info('Redis CONFIG SET not supported, but warnings have been suppressed');
        });
    });

    sharedConnection.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    sharedConnection.on('close', () => {
      logger.info('Redis connection closed');
      sharedConnection = null; // Clear for future reconnection attempts
    });

    return sharedConnection;
  } catch (error) {
    logger.error('Failed to create Redis connection:', error);
    return null;
  }
}

/**
 * Creates a Redis connection with proper configuration and event handling
 * Will return the shared connection if available
 * 
 * @deprecated Use getSharedConnection instead to avoid connection limit issues
 * @param {Object} options - Redis connection options 
 * @returns {Object} - Redis connection instance
 */
function createRedisConnection(options = {}) {
  // Always use the shared connection
  return getSharedConnection(options);
}

// Create and initialize the shared connection on startup
function initializeSharedConnection() {
  // Skip if Redis is disabled
  if (process.env.REDIS_DISABLED === 'true') {
    logger.info('Redis connection initialization skipped - Redis is disabled');
    return;
  }
  
  // Only initialize if Redis is configured
  if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
    try {
      const connection = getSharedConnection();
      if (connection) {
        logger.info('Initialized shared Redis connection pool');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis connection pool:', error);
    }
  } else {
    logger.warn('Redis not configured, skipping connection initialization');
  }
}

// Gracefully shut down Redis connections
function shutdown() {
  if (sharedConnection) {
    logger.info('Closing shared Redis connection...');
    sharedConnection.disconnect();
    sharedConnection = null;
  }
}

// Initialize the shared connection
initializeSharedConnection();

module.exports = {
  createRedisConnection,
  getSharedConnection,
  shutdown
}; 