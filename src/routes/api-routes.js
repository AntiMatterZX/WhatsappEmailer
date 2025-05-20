/**
 * API routes for the dashboard
 * Provides data for dashboard widgets and status information
 */

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Group = require('../models/Group');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/dashboard - Get dashboard data
 */
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    // Get active groups count
    const activeGroups = await Group.countDocuments({ isActive: true });
    
    // Get today's messages count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMessages = await Message.countDocuments({ 
      createdAt: { $gte: today } 
    });
    
    // Get total emails sent count
    const emailsSent = await Message.countDocuments({ 
      'metadata.emailMessageId': { $exists: true } 
    });
    
    // Check system status
    // This is a simplified check - you would want to add more checks in a real app
    const systemHealthy = true;
    
    res.json({
      activeGroups,
      todayMessages,
      emailsSent,
      systemHealthy
    });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * GET /api/messages/recent - Get recent messages
 */
router.get('/messages/recent', isAuthenticated, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    // Populate group names
    const messagesWithGroupNames = await Promise.all(messages.map(async (message) => {
      try {
        const group = await Group.findOne({ groupId: message.groupId });
        return {
          ...message,
          groupName: group ? group.name : message.groupId
        };
      } catch (err) {
        return {
          ...message,
          groupName: message.groupId
        };
      }
    }));
    
    res.json(messagesWithGroupNames);
  } catch (error) {
    logger.error('Error fetching recent messages:', error);
    res.status(500).json({ error: 'Failed to fetch recent messages' });
  }
});

/**
 * GET /api/whatsapp/status - Get WhatsApp connection status
 */
router.get('/whatsapp/status', isAuthenticated, async (req, res) => {
  try {
    // Default status information
    let status = {
      connected: false,
      qrCode: null,
      connectedSince: null,
      phone: null,
      state: 'disconnected',
      info: null
    };
    
    // Check if client exists
    const client = req.app.get('whatsappClient');
    if (!client) {
      logger.debug('WhatsApp status check: No client instance available');
      
      // Still check for QR code in app state, might be being generated
      const qrCode = req.app.get('whatsappQR');
      if (qrCode) {
        status.qrCode = qrCode;
        status.state = 'qr_ready';
      }
      
      return res.json(status);
    }
    
    // Get QR code if available (even if client exists)
    const qrCode = req.app.get('whatsappQR');
    if (qrCode) {
      status.qrCode = qrCode;
      status.state = 'qr_ready';
    }
    
    // Get connected since timestamp if available
    const connectedSince = req.app.get('whatsappConnectedSince');
    if (connectedSince) {
      status.connectedSince = connectedSince;
    }
    
    // Check detailed client state
    try {
      // WhatsApp Web client has different ways to check if it's truly connected
      
      // First check if authentication info exists
      if (client.info) {
        status.connected = true;
        status.state = 'connected';
        status.info = {
          me: {
            user: client.info.wid.user,
            pushname: client.info.pushname || 'Unknown'
          },
          platform: client.info.platform || 'Unknown'
        };
        status.phone = client.info.wid.user;
      }
      // Next check if we have a puppeteer page but no info yet (connecting)
      else if (client.pupPage) {
        // Check if the page is still valid
        try {
          const url = await client.pupPage.url();
          if (url && url.includes('web.whatsapp.com')) {
            status.connected = false;
            status.state = 'connecting';
          } else {
            logger.warn('WhatsApp page URL unexpected:', url);
            status.state = 'error';
          }
        } catch (pageError) {
          logger.warn('Error checking WhatsApp page state:', pageError.message);
          status.state = 'error';
        }
      }
      // If we have a client but no page and no info, it's likely initializing
      else {
        status.state = 'initializing';
      }
    } catch (clientError) {
      logger.warn('Error checking WhatsApp client state:', clientError.message);
      status.state = 'error';
      status.error = clientError.message;
    }
    
    // If there's a QR code but client says connected, prioritize client state
    if (status.state === 'connected' && status.qrCode) {
      // Connected takes priority over QR code
      status.qrCode = null;
    }
    
    logger.debug(`WhatsApp status check: ${status.state}`);
    res.json(status);
  } catch (error) {
    logger.error('Error checking WhatsApp status:', error);
    res.status(500).json({ 
      error: 'Failed to check WhatsApp status', 
      message: error.message,
      state: 'error' 
    });
  }
});

/**
 * POST /api/whatsapp/restart - Restart WhatsApp client
 */
router.post('/whatsapp/restart', isAuthenticated, async (req, res) => {
  try {
    // Get the current WhatsApp client
    const client = req.app.get('whatsappClient');
    
    if (!client) {
      // No client exists, treat this as a connect request instead
      logger.info('No WhatsApp client found during restart - redirecting to connect');
      
      // Redirect to the connect endpoint
      return res.json({ 
        success: true, 
        message: 'No WhatsApp client found, initiating connection...',
        action: 'connect'
      });
    }
    
    const username = req.session?.user?.username || 'unknown';
    logger.info(`WhatsApp client restart requested by user: ${username}`);
    
    // First remove client from app to prevent automatic reconnection
    req.app.set('whatsappClient', null);
    
    // Reset connection status in app state
    req.app.set('whatsappConnectedSince', null);
    req.app.set('whatsappQR', null);
    
    try {
      // Properly destroy the client
      await client.destroy();
      logger.info('WhatsApp client destroyed successfully for restart');
    } catch (destroyError) {
      logger.error('Error destroying WhatsApp client during restart:', destroyError);
      // Continue despite error - we still want to create a new client
    }
    
    // Return success immediately
    res.json({ 
      success: true, 
      message: 'WhatsApp client has been stopped. Initiating new connection...'
    });
    
    // Start a new client asynchronously (after response)
    setTimeout(() => {
      try {
        // Forward to the connect endpoint's logic
        // Make a request to our own connect endpoint
        const connectUrl = `${req.protocol}://${req.get('host')}/api/whatsapp/connect`;
        
        // Use Node's https/http module to make the request
        const { request } = require(req.protocol === 'https' ? 'https' : 'http');
        
        const connectReq = request(connectUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.cookie, // Forward cookies for authentication
            'Authorization': req.headers.authorization
          }
        }, (connectRes) => {
          let data = '';
          connectRes.on('data', (chunk) => {
            data += chunk;
          });
          connectRes.on('end', () => {
            logger.info('Connect endpoint response:', data);
          });
        });
        
        connectReq.on('error', (error) => {
          logger.error('Error making connect request after restart:', error);
        });
        
        connectReq.end();
        
      } catch (error) {
        logger.error('Error initiating new WhatsApp connection after restart:', error);
      }
    }, 1000); // Wait 1 second before connecting
    
  } catch (error) {
    logger.error('Error restarting WhatsApp client:', error);
    res.status(500).json({ 
      error: 'Failed to restart WhatsApp client',
      message: error.message 
    });
  }
});

/**
 * POST /api/whatsapp/disconnect - Explicitly logout and disconnect WhatsApp
 */
router.post('/whatsapp/disconnect', isAuthenticated, async (req, res) => {
  try {
    // Get the WhatsApp client from the app
    let client = req.app.get('whatsappClient');
    
    if (!client) {
      return res.status(500).json({ error: 'WhatsApp client not found' });
    }
    
    const username = req.session?.user?.username || 'unknown';
    logger.info(`WhatsApp client disconnect requested by user: ${username}`);
    
    // CRITICAL: First remove the client from app to prevent auto-reconnection attempts
    req.app.set('whatsappClient', null);
    
    // Update application state immediately
    req.app.set('whatsappConnectedSince', null);
    req.app.set('whatsappQR', null);
    
    // Log attempt to destroy the client instance
    logger.info('Attempting to destroy WhatsApp client...');
    
    try {
      // Attempt to logout first - this is cleaner than just destroying
      try {
        await client.logout();
        logger.info('WhatsApp client logged out successfully');
      } catch (logoutError) {
        logger.warn('Could not logout WhatsApp client gracefully:', logoutError.message);
        // Continue to destroy even if logout fails
      }
      
      // Now destroy the client instance
      await client.destroy();
      logger.info('WhatsApp client destroyed successfully');
      
      // Explicitly set to null to help garbage collection
      client = null;
    } catch (destroyError) {
      logger.error('Error destroying WhatsApp client:', destroyError);
      // We continue despite this error to clean up session files
    }
    
    // Return success first - file cleanup will happen in background
    res.json({ success: true, message: 'WhatsApp client disconnected successfully' });
    
    // IMPORTANT: Don't wait for session file deletion before responding to user
    // This runs after the response is sent
    setTimeout(async () => {
      // Now clean up session files
      const sessionPath = process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth';
      if (sessionPath) {
        try {
          // Use Node.js fs promises API
          const fs = require('fs').promises;
          const path = require('path');
          
          const sessionFolder = path.resolve(sessionPath);
          
          try {
            // Check if folder exists before trying to read it
            const stats = await fs.stat(sessionFolder);
            
            if (stats.isDirectory()) {
              logger.info(`Attempting to clean session folder: ${sessionFolder}`);
              
              // Get list of files in session directory
              const sessionDir = path.join(sessionFolder, 'session');
              const multiDeviceDir = path.join(sessionFolder, 'session-MultiDevice');
              
              // Try to clean the regular session directory
              try {
                const files = await fs.readdir(sessionDir);
                logger.info(`Found ${files.length} files in session directory`);
                
                for (const file of files) {
                  const filePath = path.join(sessionDir, file);
                  try {
                    await fs.unlink(filePath);
                    logger.info(`Deleted session file: ${file}`);
                  } catch (unlinkError) {
                    logger.warn(`Could not delete session file ${file}: ${unlinkError.message}`);
                  }
                }
              } catch (error) {
                logger.info(`No session directory found or error accessing it: ${error.message}`);
              }
              
              // Try to clean the multi-device session directory
              try {
                const mdFiles = await fs.readdir(multiDeviceDir);
                logger.info(`Found ${mdFiles.length} files in multi-device session directory`);
                
                for (const file of mdFiles) {
                  const filePath = path.join(multiDeviceDir, file);
                  try {
                    await fs.unlink(filePath);
                    logger.info(`Deleted multi-device session file: ${file}`);
                  } catch (unlinkError) {
                    logger.warn(`Could not delete multi-device session file ${file}: ${unlinkError.message}`);
                  }
                }
              } catch (error) {
                logger.info(`No multi-device session directory found or error accessing it: ${error.message}`);
              }
            } else {
              logger.warn(`Session path exists but is not a directory: ${sessionFolder}`);
            }
          } catch (statErr) {
            logger.warn(`Session folder does not exist or cannot be accessed: ${sessionFolder}`);
          }
        } catch (err) {
          logger.error('Error during session cleanup:', err);
        }
      }
    }, 100); // Short delay to allow response to be sent first
    
  } catch (error) {
    logger.error('Error disconnecting WhatsApp client:', error);
    res.status(500).json({ error: 'Failed to disconnect WhatsApp client: ' + error.message });
  }
});

/**
 * POST /api/whatsapp/connect - Start a new WhatsApp connection with QR code generation
 */
router.post('/whatsapp/connect', isAuthenticated, async (req, res) => {
  try {
    const username = req.session?.user?.username || 'unknown';
    logger.info(`WhatsApp client connect requested by user: ${username}`);
    
    // Clear any existing client
    let currentClient = req.app.get('whatsappClient');
    if (currentClient) {
      logger.info('Destroying existing WhatsApp client before creating new one');
      try {
        await currentClient.destroy();
        // Help garbage collection
        currentClient = null;
      } catch (destroyError) {
        logger.error('Error destroying existing client:', destroyError);
      }
      // Always null out the client in app state
      req.app.set('whatsappClient', null);
    }
    
    // Import required modules
    const { Client, LocalAuth } = require('whatsapp-web.js');
    
    // Reset connection status in app state
    req.app.set('whatsappConnectedSince', null);
    req.app.set('whatsappQR', null);
    
    // Create new client with a fresh authentication session
    const authPath = process.env.WHATSAPP_SESSION_PATH || './.wwebjs_auth';
    const sessionFolderName = 'session-' + Date.now(); // Generate unique session folder
    
    // Define client options with care
    const clientOptions = {
      authStrategy: new LocalAuth({
        clientId: sessionFolderName, // Use timestamp-based unique folder
        dataPath: authPath
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
        ]
      },
      webVersionCache: {
        type: 'none' // Disable web version cache to avoid issues
      }
    };
    
    // Create new client
    const client = new Client(clientOptions);
    logger.info('Created new WhatsApp client instance');
    
    // Set up event handlers BEFORE initialization
    client.on('qr', (qr) => {
      logger.info('QR Code received for WhatsApp authentication');
      
      // Generate SVG QR code for web display
      try {
        const qrCodeSvg = require('qrcode-svg');
        const qrSvg = new qrCodeSvg({
          content: qr,
          width: 256,
          height: 256,
          color: '#000000',
          background: '#ffffff',
          ecl: 'M',
          padding: 4
        }).svg();
        
        // Save QR code to app state for UI to access
        req.app.set('whatsappQR', qrSvg);
        logger.info('QR code saved to app state for UI display');
      } catch (qrError) {
        logger.error('Error generating QR code SVG:', qrError);
      }
    });
    
    client.on('ready', () => {
      logger.info('WhatsApp client is ready and authenticated');
      req.app.set('whatsappConnectedSince', new Date());
      req.app.set('whatsappQR', null); // Clear QR code when connected
    });
    
    client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated successfully');
    });
    
    client.on('auth_failure', (msg) => {
      logger.error('WhatsApp authentication failed:', msg);
    });
    
    client.on('disconnected', (reason) => {
      logger.warn(`WhatsApp client disconnected: ${reason || 'Unknown reason'}`);
      req.app.set('whatsappConnectedSince', null);
      // Prevent auto-reconnect on disconnect event by removing client reference
      req.app.set('whatsappClient', null);
    });
    
    // Store client in app state
    req.app.set('whatsappClient', client);
    
    // Initialize the client to trigger QR code generation
    // We initialize AFTER setting up ALL event handlers
    logger.info('Starting WhatsApp client initialization');
    
    // Don't await initialization as it might take a while
    // Instead, start the process and let the UI poll for the QR
    client.initialize().catch(err => {
      logger.error('Error during WhatsApp client initialization:', err);
    });
    
    // Respond to user immediately
    res.json({ 
      success: true, 
      message: 'WhatsApp connection initiated. QR code will be generated shortly.'
    });
    
  } catch (error) {
    logger.error('Error initiating WhatsApp connection:', error);
    res.status(500).json({ 
      error: 'Failed to start WhatsApp connection: ' + error.message 
    });
  }
});

/**
 * POST /api/cache/clear - Clear application cache
 */
router.post('/cache/clear', isAuthenticated, async (req, res) => {
  try {
    const username = req.session?.user?.username || 'unknown';
    logger.info(`Cache clear requested by user: ${username}`);
    
    // Clear your application caches here
    // This is just a placeholder - implement your actual cache clearing logic
    
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// WhatsApp client control endpoints
router.post('/whatsapp/control', isAdmin, async (req, res) => {
  try {
    const { action } = req.body;
    const client = req.app.get('whatsappClient');
    
    if (!client) {
      return res.status(500).json({ success: false, error: 'WhatsApp client not initialized' });
    }
    
    if (action === 'restart') {
      // Destroy existing client and reinitialize
      logger.info('Admin requested WhatsApp client restart');
      
      try {
        await client.destroy();
        logger.info('WhatsApp client destroyed, reinitializing...');
        
        // Wait a moment before reinitializing
        setTimeout(() => {
          client.initialize().catch(err => {
            logger.error('Error reinitializing WhatsApp client:', err);
          });
        }, 1000);
        
        return res.json({ success: true, message: 'WhatsApp client is restarting' });
      } catch (error) {
        logger.error('Error during WhatsApp client restart:', error);
        return res.status(500).json({ success: false, error: 'Error restarting WhatsApp client' });
      }
    } else if (action === 'logout') {
      // Logout of WhatsApp
      logger.info('Admin requested WhatsApp client logout');
      
      try {
        await client.logout();
        logger.info('WhatsApp client logged out successfully');
        
        return res.json({ success: true, message: 'WhatsApp client logged out successfully' });
      } catch (error) {
        logger.error('Error during WhatsApp client logout:', error);
        return res.status(500).json({ success: false, error: 'Error logging out WhatsApp client' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action. Use "restart" or "logout"' });
    }
  } catch (error) {
    logger.error('Error controlling WhatsApp client:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router; 