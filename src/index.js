/**
 * WhatsApp Bot Server Application
 * Main entry point that initializes the WhatsApp client, Express server, and message processing
 * 
 * This application monitors WhatsApp group messages, processes them according to rules,
 * and can forward messages to email or webhooks based on configured rules
 */

// Load environment variables from .env file
require('dotenv').config();
// Load Redis configuration early to suppress warnings
require('./utils/redisConfig');

// Core dependencies
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const MongoStore = require('connect-mongo');

// Application modules
const { setupMessageQueue } = require('./queues/messageQueue');
const webhookRoutes = require('./routes/webhook');
const logsRoutes = require('./routes/logs');
const logsUiRoutes = require('./routes/logs-ui');
const authRoutes = require('./routes/auth-routes');
const apiRoutes = require('./routes/api-routes');
const settingsRoutes = require('./routes/settings-routes');
const MessageProcessor = require('./services/messageProcessor');
const AutomationEngine = require('./services/automationEngine');
const metrics = require('./monitoring/prometheus');
const logger = require('./utils/logger');
const debugMiddleware = require('./middleware/debug');

// Initialize log monitor for centralized logging
require('./utils/logMonitor');
const fs = require('fs');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Set up EJS templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'whatsapp-bot-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 14 * 24 * 60 * 60, // 14 days
    autoRemove: 'native',
    touchAfter: 24 * 3600, // time period in seconds
    crypto: {
      secret: process.env.SESSION_SECRET || 'whatsapp-bot-secret'
    },
    collectionName: 'sessions',
    stringify: false
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'whatsapp.sid',
  rolling: true
}));

// Flash messages
app.use(flash());

// Add debug middleware after the session middleware
app.use(debugMiddleware);

// Create HTTP server
const server = http.createServer(app);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// ----- Security middleware -----

// Rate limiting to prevent abuse
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

/**
 * Initialize WhatsApp client with authentication and browser settings
 * Uses LocalAuth for session persistence
 */
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: '/tmp/.wwebjs_auth_session'
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
      '--disable-gpu'
    ],
    defaultViewport: { width: 1280, height: 900 }
  }
});

// Store WhatsApp client in app for access from routes
app.set('whatsappClient', client);

// Initialize message queue and services
const messageQueue = setupMessageQueue();
const messageProcessor = new MessageProcessor(client, messageQueue);
const automationEngine = new AutomationEngine(client, messageQueue);

// ----- WhatsApp client event handlers -----

/**
 * Display QR code for WhatsApp Web authentication
 */
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  logger.info('QR Code generated. Please scan to authenticate.');
  
  // Save QR for web display
  const qrCodeSvg = require('qrcode-svg');
  const qrSvg = new qrCodeSvg({
    content: qr,
    width: 256,
    height: 256,
    color: '#000000',
    background: '#ffffff',
    ecl: 'M'
  }).svg();
  
  app.set('whatsappQR', qrSvg);
});

/**
 * Handle client ready event
 */
client.on('ready', () => {
  logger.info('WhatsApp client is ready!');
  metrics.whatsappConnectionGauge.set(1);
  app.set('whatsappConnectedSince', new Date());
  app.set('whatsappQR', null);
});

/**
 * Handle successful authentication
 */
client.on('authenticated', () => {
  logger.info('WhatsApp client authenticated');
});

/**
 * Handle authentication failures
 */
client.on('auth_failure', (msg) => {
  logger.error('WhatsApp authentication failed:', msg);
  metrics.whatsappConnectionGauge.set(0);
});

/**
 * Handle client disconnection
 */
client.on('disconnected', () => {
  logger.warn('WhatsApp client disconnected');
  metrics.whatsappConnectionGauge.set(0);
  app.set('whatsappConnectedSince', null);
});

/**
 * Handle incoming messages
 * Processes messages through messageProcessor and automationEngine
 */
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

// ----- Express Routes -----

// Root route renders home page
app.get('/', (req, res) => {
  try {
    // Debug logging with safe access
    const hasSession = !!(req.session && req.session.user);
    
    // If the user is logged in, redirect directly to dashboard
    if (hasSession) {
      return res.redirect('/dashboard');
    }
    
    // Otherwise render the home page with explicit user null check
    return res.render('home', { 
      title: 'WhatsApp Bot Admin - Home',
      user: null
    });
  } catch (error) {
    // Log error but don't crash
    logger.error('Error in root route:', error.message);
    
    // Render a simpler page without any session dependencies
    return res.status(200).send(`
      <html>
        <head>
          <title>WhatsApp Bot Admin</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
            a { display: inline-block; margin: 20px; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>WhatsApp Bot Admin</h1>
          <p>Welcome to the WhatsApp Bot Administration Portal</p>
          <a href="/login">Login to Dashboard</a>
        </body>
      </html>
    `);
  }
});

// Authentication routes
app.use('/', authRoutes);

// API routes for dashboard
app.use('/api', apiRoutes);

// Settings routes
app.use('/settings', settingsRoutes);
app.use('/api/settings', settingsRoutes);

// WhatsApp connection control route
app.get('/whatsapp/control', (req, res) => {
  res.render('whatsapp-control', { 
    title: 'WhatsApp Connection Control',
    user: req.session.user,
    activeTab: 'whatsapp-control'
  });
});

// Existing routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/logs', logsRoutes);
app.use('/logs', logsUiRoutes);

/**
 * Health check endpoint for monitoring
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsapp: client.pupPage ? 'connected' : 'disconnected',
    queue: messageQueue ? 'active' : 'inactive'
  });
});

/**
 * Status endpoint for client-side apps
 */
app.get('/api/status', (req, res) => {
  // Get WhatsApp connection details
  let whatsappStatus = 'disconnected';
  let whatsappInfo = null;
  
  // Check if client is fully ready
  if (client.info) {
    whatsappStatus = 'connected';
    
    // Get session info
    whatsappInfo = {
      me: {
        user: client.info.wid.user,
        pushname: client.info.pushname || 'Unknown'
      },
      platform: client.info.platform || 'Unknown'
    };
  } else if (client.pupPage) {
    // Client is initialized but not fully connected
    whatsappStatus = 'connecting';
  } else if (app.get('whatsappQR')) {
    // QR code is ready
    whatsappStatus = 'qr_ready';
  }

  // Return system status
  res.json({
    time: new Date().toISOString(),
    status: 'ok',
    whatsapp: whatsappStatus,
    whatsappConnectedSince: app.get('whatsappConnectedSince'),
    whatsappQR: app.get('whatsappQR'),
    whatsappInfo: whatsappInfo,
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage()
  });
});

// Add diagnostic endpoint for session debugging
app.get('/debug-session', (req, res) => {
  try {
    const sessionInfo = {
      hasSession: !!req.session,
      sessionID: req.sessionID || 'none',
      hasUser: !!(req.session && req.session.user),
      userData: req.session?.user ? {
        username: req.session.user.username,
        role: req.session.user.role
      } : null,
      cookies: req.cookies ? Object.keys(req.cookies) : [],
      env: {
        NODE_ENV: process.env.NODE_ENV || 'not-set',
        VERCEL: !!process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV || 'not-set'
      }
    };
    
    return res.json(sessionInfo);
  } catch (error) {
    logger.error('Error in debug-session route:', error.message);
    return res.status(200).json({
      error: 'Error generating debug info',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      time: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).render('error', {
    error: {
      status: 404,
      message: 'Page Not Found',
      description: 'The page you are looking for does not exist.'
    }
  });
});

app.use((err, req, res, next) => {
  logger.error('Express error handler caught error:', err);
  res.status(500).render('error', {
    error: {
      status: 500,
      message: 'Internal Server Error',
      description: process.env.NODE_ENV === 'production' 
        ? 'Something went wrong on our end. Please try again later.'
        : err.message
    }
  });
});

/**
 * Attempt to start the server on the specified port
 * Returns the port if successful, false if the port is in use
 * 
 * @param {number} port - Port to attempt to bind to
 * @returns {Promise<number|boolean>} - Port number if successful, false if unavailable
 */
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

/**
 * Bootstrap the entire application
 * Initializes WhatsApp client, starts server, and connects to MongoDB
 */
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
        .then(() => {
          logger.info('Connected to MongoDB');
          // Create default admin user if no users exist
          createDefaultAdmin();
        })
        .catch(err => logger.error('MongoDB connection error:', err));
    }
    
  } catch (error) {
    logger.error('Server bootstrap failed:', error);
    process.exit(1);
  }
}

/**
 * Create a default admin user if no users exist in the system
 */
async function createDefaultAdmin() {
  try {
    const User = require('./models/User');
    const userCount = await User.countDocuments();
    
    if (userCount === 0) {
      logger.info('No users found, creating default admin user');
      
      const defaultUser = new User({
        username: 'admin',
        email: 'admin@example.com',
        password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
        role: 'admin'
      });
      
      await defaultUser.save();
      logger.info('Default admin user created successfully');
    }
  } catch (error) {
    logger.error('Error creating default admin user:', error);
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
  } catch (e) {
    console.error('Error logging email event:', e);
  }
}

/**
 * Graceful shutdown handling
 * Closes database connections and other resources properly
 */
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  logger.info('Received shutdown signal, closing connections...');
  
  try {
    // Close MongoDB connection if it exists
    if (mongoose.connection.readyState) {
      mongoose.connection.close(() => {
        logger.info('MongoDB connection closed');
      });
    }
    
    // Close express server
    server.close(() => {
      logger.info('Express server closed');
      process.exit(0);
    });
    
    // Set a timeout to force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
    
  } catch (e) {
    logger.error('Error during shutdown:', e);
    process.exit(1);
  }
}

// Export the Express app for Vercel
module.exports = app; 