const express = require('express');
const winston = require('winston');
const router = express.Router();
const multer = require('multer');
const path = require('path');

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

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

function setupRoutes(app, client, messageQueue) {
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      whatsapp: client.pupPage ? 'connected' : 'disconnected',
      queue: messageQueue ? 'active' : 'inactive'
    });
  });

  // Webhook endpoint for external integrations
  app.post('/webhook', express.json(), async (req, res) => {
    try {
      const { type, data } = req.body;
      
      // Validate webhook payload
      if (!type || !data) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      // Add to message queue
      await messageQueue.add(type, data);
      
      res.json({ message: 'Webhook received and queued' });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  // File upload endpoint
  router.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const filePaths = req.files.map(f => `/uploads/${f.filename}`);
    res.json({ files: filePaths });
  });
}

module.exports = {
  setupRoutes,
  router
}; 