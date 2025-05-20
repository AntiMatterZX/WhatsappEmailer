/**
 * Settings routes for the admin panel
 * Handles environment variables management
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// Path to .env file (relative to project root)
const ENV_FILE_PATH = path.join(process.cwd(), '.env');

// Default environment variables if .env doesn't exist
const DEFAULT_ENV_VARS = {
  PORT: '3000',
  NODE_ENV: 'development',
  SESSION_SECRET: 'whatsapp-bot-secret',
  WHATSAPP_SESSION_PATH: './.wwebjs_auth',
  MONGODB_URI: 'mongodb://localhost:27017/whatsapp-bot',
  RATE_LIMIT_WINDOW: '15', // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: '100',
  DEFAULT_ADMIN_PASSWORD: 'admin123',
  LOG_LEVEL: 'info'
};

/**
 * GET /settings - Render settings page
 */
router.get('/', isAuthenticated, (req, res) => {
  res.render('settings', {
    title: 'Settings - WhatsApp Bot Admin',
    user: req.session.user,
    activeTab: 'settings'
  });
});

/**
 * GET /api/settings/env - Get environment variables
 * This is admin-only to prevent leaking sensitive information
 */
router.get('/env', isAdmin, (req, res) => {
  try {
    // Load environment variables
    let envVars = {};
    
    if (fs.existsSync(ENV_FILE_PATH)) {
      const envFileContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
      envVars = dotenv.parse(envFileContent);
    }
    
    res.json({
      success: true,
      env: envVars
    });
  } catch (error) {
    logger.error('Error loading environment variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error loading environment variables'
    });
  }
});

/**
 * POST /api/settings/env - Save environment variables
 * This is admin-only to prevent unauthorized changes
 */
router.post('/env', isAdmin, (req, res) => {
  try {
    const { env } = req.body;
    
    if (!env || typeof env !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid environment variables data'
      });
    }
    
    // Format the environment variables as KEY=VALUE pairs
    const envContent = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Write to .env file
    fs.writeFileSync(ENV_FILE_PATH, envContent);
    
    const username = req.session?.user?.username || 'admin';
    logger.info(`Environment variables updated by user: ${username}`);
    
    res.json({
      success: true,
      message: 'Environment variables saved successfully'
    });
  } catch (error) {
    logger.error('Error saving environment variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error saving environment variables'
    });
  }
});

/**
 * POST /api/settings/env/setup - Set up default environment variables
 * This is admin-only to prevent unauthorized changes
 */
router.post('/env/setup', isAdmin, (req, res) => {
  try {
    // Format the environment variables as KEY=VALUE pairs
    const envContent = Object.entries(DEFAULT_ENV_VARS)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Write to .env file
    fs.writeFileSync(ENV_FILE_PATH, envContent);
    
    const username = req.session?.user?.username || 'admin';
    logger.info(`Default environment variables set up by user: ${username}`);
    
    res.json({
      success: true,
      message: 'Default environment variables set up successfully',
      env: DEFAULT_ENV_VARS
    });
  } catch (error) {
    logger.error('Error setting up default environment variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error setting up default environment variables'
    });
  }
});

/**
 * POST /api/settings/env/reset - Reset environment variables to defaults
 * This is admin-only to prevent unauthorized changes
 */
router.post('/env/reset', isAdmin, (req, res) => {
  try {
    // Check if .env file exists first
    if (!fs.existsSync(ENV_FILE_PATH)) {
      return res.status(404).json({
        success: false,
        error: 'No .env file found to reset'
      });
    }
    
    // Format the environment variables as KEY=VALUE pairs
    const envContent = Object.entries(DEFAULT_ENV_VARS)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Write to .env file
    fs.writeFileSync(ENV_FILE_PATH, envContent);
    
    const username = req.session?.user?.username || 'admin';
    logger.info(`Environment variables reset to defaults by user: ${username}`);
    
    res.json({
      success: true,
      message: 'Environment variables reset to defaults successfully',
      env: DEFAULT_ENV_VARS
    });
  } catch (error) {
    logger.error('Error resetting environment variables:', error);
    res.status(500).json({
      success: false,
      error: 'Error resetting environment variables'
    });
  }
});

module.exports = router; 