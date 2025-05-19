const axios = require('axios');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'webhook.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

class WebhookService {
  constructor() {
    this.retryLimit = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Send a webhook request to an external service
   * @param {Object} options - Webhook configuration
   * @param {String} options.url - Target URL
   * @param {String} options.method - HTTP method (GET, POST, PUT, DELETE)
   * @param {Object} options.headers - Custom HTTP headers
   * @param {Object} options.payload - Data payload
   * @returns {Promise<Object>} - Response data
   */
  async sendWebhook(options) {
    const { url, method = 'POST', headers = {}, payload } = options;
    
    let attempts = 0;
    let lastError = null;
    
    while (attempts < this.retryLimit) {
      try {
        logger.info(`Sending webhook to ${url} (attempt ${attempts + 1})`);
        
        const response = await axios({
          url,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          data: payload,
          timeout: 10000 // 10 seconds timeout
        });
        
        logger.info(`Webhook to ${url} successful with status ${response.status}`);
        
        return {
          success: true,
          statusCode: response.status,
          data: response.data
        };
        
      } catch (error) {
        attempts++;
        lastError = error;
        
        logger.warn(`Webhook attempt ${attempts} failed: ${error.message}`);
        
        if (attempts < this.retryLimit) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }
    
    // All attempts failed
    logger.error(`Webhook to ${url} failed after ${this.retryLimit} attempts`, lastError);
    
    return {
      success: false,
      error: lastError.message,
      statusCode: lastError.response?.status || 0
    };
  }

  /**
   * Register a new webhook endpoint
   * @param {String} name - Webhook name
   * @param {String} url - Target URL
   * @param {Object} config - Additional configuration
   * @returns {Object} - Created webhook
   */
  async registerWebhook(name, url, config = {}) {
    // This would typically store the webhook in a database
    logger.info(`Registering new webhook: ${name} to ${url}`);
    
    // Example implementation - in a real app, this would save to DB
    return {
      id: Date.now().toString(),
      name,
      url,
      config,
      createdAt: new Date()
    };
  }

  /**
   * Test a webhook with sample data
   * @param {String} url - Target URL
   * @param {Object} sampleData - Test payload
   * @returns {Promise<Object>} - Response data
   */
  async testWebhook(url, sampleData) {
    logger.info(`Testing webhook to ${url}`);
    
    return this.sendWebhook({
      url,
      method: 'POST',
      payload: {
        ...sampleData,
        test: true,
        timestamp: new Date().toISOString()
      }
    });
  }
}

module.exports = WebhookService; 