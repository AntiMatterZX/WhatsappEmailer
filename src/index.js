require('dotenv').config();
// Load Redis configuration early to suppress warnings
require('./utils/redisConfig');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { setupMessageQueue } = require('./queues/messageQueue');
const webhookRoutes = require('./routes/webhook');
const logsRoutes = require('./routes/logs');
const logsUiRoutes = require('./routes/logs-ui');
const MessageProcessor = require('./services/messageProcessor');
const AutomationEngine = require('./services/automationEngine');
const metrics = require('./monitoring/prometheus');
const logger = require('./utils/logger');
// Initialize log monitor
require('./utils/logMonitor');
const fs = require('fs');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Security middleware

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS
});
app.use('/api', limiter);

// Add Prometheus monitoring middleware
app.use(metrics.httpRequestDurationMiddleware);

// Expose Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.WHATSAPP_SESSION_PATH
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', 
      '--disable-accelerated-2d-canvas', 
      '--no-first-run', 
      '--no-zygote', 
      '--single-process', 
      '--disable-gpu',
      '--disable-web-security',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    defaultViewport: { width: 1280, height: 900 }
  }
});

// Initialize message queue
const messageQueue = setupMessageQueue();
const messageProcessor = new MessageProcessor(client, messageQueue);
const automationEngine = new AutomationEngine(client, messageQueue);

// WhatsApp client event handlers
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  logger.info('QR Code generated. Please scan to authenticate.');
});

client.on('ready', () => {
  logger.info('WhatsApp client is ready!');
  metrics.whatsappConnectionGauge.set(1);
});

client.on('authenticated', () => {
  logger.info('WhatsApp client authenticated');
});

client.on('auth_failure', (msg) => {
  logger.error('WhatsApp authentication failed:', msg);
  metrics.whatsappConnectionGauge.set(0);
});

client.on('disconnected', () => {
  logger.warn('WhatsApp client disconnected');
  metrics.whatsappConnectionGauge.set(0);
});

// Handle incoming messages
client.on('message_create', async (msg) => {
  try {
    if (msg.fromMe) return;
    
    // Track message received metrics
    const messageType = msg.body.includes('URGENT') ? 'URGENT' : 'NORMAL';
    metrics.messageReceivedCounter.inc({ type: messageType });
    
    // Start processing time measurement
    const endTimer = metrics.messageProcessingTime.startTimer({ type: messageType });
    
    // Process the message
    await messageProcessor.processMessage(msg);
    
    // Find and execute any matching automation rules
    const triggeredRules = await automationEngine.evaluateMessage(msg, msg.from);
    
    // End timer and record processing time
    endTimer();
    
    // Track message processed metrics
    metrics.messageProcessedCounter.inc({ type: messageType, status: 'success' });
  } catch (error) {
    logger.error('Error processing message:', error);
    metrics.messageProcessedCounter.inc({ type: 'unknown', status: 'error' });
  }
});

// Health check route
app.get('/', (req, res) => {
  res.send('WhatsApp Bot API is running');
});

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsapp: client.pupPage ? 'connected' : 'disconnected',
    queue: messageQueue ? 'active' : 'inactive'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error handler caught error:', err);
  res.status(500).send('Internal Server Error');
});

// API routes setup
app.use('/api/webhook', webhookRoutes);
app.use('/api/logs', logsRoutes);
app.use('/logs', logsUiRoutes);

// Try different ports in sequence if the preferred port is not available
const startServer = (port) => {
  return new Promise((resolve, reject) => {
    try {
      server.listen(port, () => {
        logger.info(`WhatsApp Bot server started on port ${port}`);
        resolve(port);
      });
      
      server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} is already in use, trying next port`);
          resolve(false);
        } else {
          reject(e);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Start the servers
async function bootstrap() {
  try {
    // Initialize WhatsApp client
    client.initialize().catch(err => {
      logger.error('Failed to initialize WhatsApp client:', err);
    });
    
    // Try to use preferred port first, then fall back to alternatives
    const preferredPort = process.env.PORT || 3000;
    const alternativePorts = [3001, 3002, 3003];
    
    // Try preferred port first
    let portInUse = await startServer(preferredPort);
    
    // If preferred port is not available, try alternatives
    if (!portInUse) {
      for (const port of alternativePorts) {
        portInUse = await startServer(port);
        if (portInUse) {
          break;
        }
      }
    }
    
    if (!portInUse) {
      logger.error('Could not find an available port to use');
      process.exit(1);
    }
    
    // Log startup information
    const envInfo = `${process.env.NODE_ENV || 'development'} mode`;
    
    logger.info(`⚡ WhatsApp Bot API is ready (${envInfo})  - PORT: ${portInUse}`);
    
    // Connect to MongoDB if configured
    if (process.env.MONGODB_URI) {
      mongoose.connect(process.env.MONGODB_URI)
        .then(() => logger.info('Connected to MongoDB'))
        .catch(err => logger.error('MongoDB connection error:', err));
    }
    
  } catch (error) {
    logger.error('Server bootstrap failed:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();

// Helper function to log email events (used by email service)
function logEmailEvent(to, subject, status, details) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] EMAIL ${status}: To: ${to}, Subject: ${subject}, ${details || ''}\n`;
    
    // Append to the email log file
    fs.appendFile('email.log', logEntry, (err) => {
      if (err) console.error('Failed to write to email log:', err);
    });
    
    // Also log to main logger
    if (status === 'SENT') {
      logger.info(`Email sent: ${subject} to ${to}`);
    } else if (status === 'ERROR') {
      logger.error(`Email error: ${subject} to ${to} - ${details}`);
    }
  } catch (error) {
    console.error('Error writing email log:', error);
  }
}

// Export helper functions for use in other modules
module.exports = {
  client,
  logEmailEvent
}; 