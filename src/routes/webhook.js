const express = require('express');
const { body, validationResult } = require('express-validator');
const WebhookService = require('../services/webhookService');
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
    new winston.transports.File({ filename: 'routes.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const router = express.Router();
const webhookService = new WebhookService();

// Register external webhook payload
router.post('/', 
  [
    body('type').notEmpty().withMessage('Webhook type is required'),
    body('data').isObject().withMessage('Webhook data must be an object')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      const { type, data } = req.body;
      
      // Process webhook
      await webhookService.sendWebhook({
        url: data.callbackUrl,
        method: 'POST',
        payload: {
          type,
          data,
          timestamp: new Date().toISOString()
        }
      });
      
      res.status(200).json({
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
});

module.exports = router; 