/**
 * API routes for the dashboard
 * Provides data for dashboard widgets and status information
 */

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Group = require('../models/Group');
const { isAuthenticated } = require('../middleware/auth');
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
    // Get the WhatsApp client from the app
    const client = req.app.get('whatsappClient');
    
    if (!client) {
      return res.status(500).json({ error: 'WhatsApp client not found' });
    }
    
    // Check if client is authenticated
    const connected = client.pupPage ? true : false;
    
    // If not connected, get the QR code if available
    let qrCode = null;
    if (!connected && req.app.get('whatsappQR')) {
      qrCode = req.app.get('whatsappQR');
    }
    
    res.json({
      connected,
      qrCode,
      connectedSince: req.app.get('whatsappConnectedSince') || null,
      phone: connected ? client.info?.wid?.user : null
    });
  } catch (error) {
    logger.error('Error checking WhatsApp status:', error);
    res.status(500).json({ error: 'Failed to check WhatsApp status' });
  }
});

/**
 * POST /api/whatsapp/restart - Restart WhatsApp client
 */
router.post('/whatsapp/restart', isAuthenticated, async (req, res) => {
  try {
    // Get the WhatsApp client from the app
    const client = req.app.get('whatsappClient');
    
    if (!client) {
      return res.status(500).json({ error: 'WhatsApp client not found' });
    }
    
    logger.info('WhatsApp client restart requested by user:', req.session.user.username);
    
    // Destroy the old client and initialize a new one
    await client.destroy();
    setTimeout(() => {
      client.initialize().catch(err => {
        logger.error('Failed to initialize WhatsApp client:', err);
      });
    }, 1000);
    
    res.json({ success: true, message: 'WhatsApp client restart initiated' });
  } catch (error) {
    logger.error('Error restarting WhatsApp client:', error);
    res.status(500).json({ error: 'Failed to restart WhatsApp client' });
  }
});

/**
 * POST /api/whatsapp/disconnect - Explicitly logout and disconnect WhatsApp
 */
router.post('/whatsapp/disconnect', isAuthenticated, async (req, res) => {
  try {
    // Get the WhatsApp client from the app
    const client = req.app.get('whatsappClient');
    
    if (!client) {
      return res.status(500).json({ error: 'WhatsApp client not found' });
    }
    
    logger.info('WhatsApp client disconnect requested by user:', req.session.user.username);
    
    // First destroy the current client
    await client.destroy();
    
    // Remove session data
    const sessionPath = process.env.WHATSAPP_SESSION_PATH;
    if (sessionPath) {
      const fs = require('fs');
      const path = require('path');
      try {
        // Try to clear the session files
        const sessionFolder = path.resolve(sessionPath);
        if (fs.existsSync(sessionFolder)) {
          logger.info(`Attempting to clear session data at: ${sessionFolder}`);
          // Delete the session files (we don't delete the entire folder)
          const files = fs.readdirSync(sessionFolder);
          for (const file of files) {
            if (file.includes('session') || file.includes('tokens') || file.includes('store')) {
              fs.unlinkSync(path.join(sessionFolder, file));
            }
          }
        }
      } catch (err) {
        logger.error('Error clearing session data:', err);
        // Continue even if clearing session files fails
      }
    }
    
    // Update application state
    req.app.set('whatsappConnectedSince', null);
    req.app.set('whatsappQR', null);
    
    res.json({ success: true, message: 'WhatsApp client disconnected successfully' });
    
  } catch (error) {
    logger.error('Error disconnecting WhatsApp client:', error);
    res.status(500).json({ error: 'Failed to disconnect WhatsApp client' });
  }
});

/**
 * POST /api/whatsapp/connect - Start a new WhatsApp connection with QR code generation
 */
router.post('/whatsapp/connect', isAuthenticated, async (req, res) => {
  try {
    // Get the WhatsApp client from the app
    const client = req.app.get('whatsappClient');
    
    if (!client) {
      return res.status(500).json({ error: 'WhatsApp client not found' });
    }
    
    logger.info('WhatsApp client connect requested by user:', req.session.user.username);
    
    // Force regeneration of QR code by destroying/recreating client
    try {
      // First destroy any existing client
      await client.destroy();
      
      // Force reset any existing state
      req.app.set('whatsappConnectedSince', null);
      req.app.set('whatsappQR', null);
      
      // Wait a moment for cleanup to complete
      setTimeout(() => {
        // Now reinitialize to generate a fresh QR code
        client.initialize().catch(err => {
          logger.error('Failed to initialize WhatsApp client for QR generation:', err);
        });
        
        logger.info('WhatsApp client initialization started with QR generation');
      }, 1000);
      
      res.json({ success: true, message: 'WhatsApp connection initiated, QR code will be generated shortly' });
    } catch (error) {
      logger.error('Error during client initialization:', error);
      res.status(500).json({ error: 'Failed to initialize WhatsApp connection' });
    }
  } catch (error) {
    logger.error('Error connecting WhatsApp client:', error);
    res.status(500).json({ error: 'Failed to connect WhatsApp client' });
  }
});

/**
 * POST /api/cache/clear - Clear application cache
 */
router.post('/cache/clear', isAuthenticated, async (req, res) => {
  try {
    logger.info('Cache clear requested by user:', req.session.user.username);
    
    // Clear your application caches here
    // This is just a placeholder - implement your actual cache clearing logic
    
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router; 