/**
 * Authentication routes for user login/logout and registration
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthenticated, isNotAuthenticated, isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /login - Render login page
 */
router.get('/login', isNotAuthenticated, (req, res) => {
  res.render('login', { 
    title: 'Login - WhatsApp Bot Admin', 
    error: req.flash('error'),
    success: req.flash('success')
  });
});

/**
 * POST /login - Process login attempt
 */
router.post('/login', isNotAuthenticated, async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Find user by username
    const user = await User.findOne({ username, isActive: true });
    
    if (!user) {
      req.flash('error', 'Invalid username or password');
      return res.redirect('/login');
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      req.flash('error', 'Invalid username or password');
      return res.redirect('/login');
    }
    
    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();
    
    // Create a simplified user object for session storage
    const sessionUser = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    // Set user in session, with improved fallback for Vercel
    if (req.session) {
      // Store user in session
      req.session.user = sessionUser;
      
      // For Vercel environment, also set a cookie with minimal auth info as backup
      if (process.env.VERCEL === '1') {
        // Use httpOnly false so it's available to client-side JavaScript if needed
        res.cookie('wa_auth_backup', JSON.stringify({
          username: user.username,
          role: user.role,
          exp: Date.now() + (24 * 60 * 60 * 1000) // 24h expiration
        }), {
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });
      }
      
      // Log success
      logger.info(`User logged in: ${username}`);
      
      // Determine where to redirect
      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      
      // Try forced save with better error handling
      try {
        if (typeof req.session.save === 'function') {
          req.session.save(err => {
            if (err) {
              logger.error(`Session save error on login: ${err.message}`);
            }
            return res.redirect(returnTo);
          });
        } else {
          logger.warn('Session save method not available, skipping save');
          return res.redirect(returnTo);
        }
      } catch (error) {
        logger.error(`Session error during save: ${error.message}`);
        return res.redirect(returnTo);
      }
    } else {
      logger.error('No session object available for login');
      
      // Set fallback cookie authentication for Vercel environment
      if (process.env.VERCEL === '1') {
        res.cookie('wa_auth_backup', JSON.stringify({
          username: user.username,
          role: user.role,
          exp: Date.now() + (24 * 60 * 60 * 1000) // 24h expiration
        }), {
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });
        
        logger.info('Set fallback authentication cookie for Vercel environment');
      }
      
      // Even without session, redirect to dashboard
      return res.redirect('/dashboard');
    }
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    req.flash('error', 'An error occurred during login');
    return res.redirect('/login');
  }
});

/**
 * GET /logout - Process logout
 */
router.get('/logout', isAuthenticated, (req, res) => {
  const username = req.session?.user?.username;
  
  // Clear user data from session first
  if (req.session) {
    req.session.user = null;
  }
  
  // Add cookie-clearing approach for both standard session and Vercel environment
  res.clearCookie('connect.sid');
  res.clearCookie('whatsapp.sid');
  res.clearCookie('wa_auth_backup');
  
  // Additional headers that might help with caching issues in certain browsers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Now destroy the session
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        logger.error(`Logout error: ${err.message}`);
      }
      
      logger.info(`User logged out: ${username}`);
      return res.redirect('/login');
    });
  } else {
    // If session object is not available (possibly Vercel serverless issue)
    logger.info(`User logged out without session: ${username}`);
    return res.redirect('/login');
  }
});

/**
 * GET /register - Admin only route to view registration page
 * In production, this should be restricted or removed
 */
router.get('/register', isAdmin, (req, res) => {
  res.render('register', {
    title: 'Register New User - WhatsApp Bot Admin',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

/**
 * POST /register - Admin only route to register new users
 * In production, this should be restricted or removed
 */
router.post('/register', isAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;
  
  try {
    // Check if username or email already exists
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      req.flash('error', 'Username or email already in use');
      return res.redirect('/register');
    }
    
    // Create new user
    const newUser = new User({
      username,
      email,
      password,
      role: role || 'viewer'
    });
    
    await newUser.save();
    
    logger.info(`New user registered: ${username}, role: ${newUser.role}`);
    req.flash('success', 'User registered successfully');
    res.redirect('/users');
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    req.flash('error', 'An error occurred during registration');
    res.redirect('/register');
  }
});

/**
 * GET /dashboard - Main dashboard page after login
 */
router.get('/dashboard', isAuthenticated, (req, res) => {
  try {
    // Check if there's a tab parameter in the URL
    const tab = req.query.tab || 'overview';
    
    // If the tab is "settings", redirect to the settings page
    if (tab === 'settings') {
      return res.redirect('/settings');
    }
    
    // Get user from session or emergency auth
    const user = req.session?.user || {
      username: 'Emergency Admin',
      role: 'admin',
      email: 'emergency@admin.com'
    };
    
    // Render dashboard with user data
    return res.render('dashboard', {
      title: 'Overview - WhatsApp Bot Admin',
      user: user,
      activeTab: tab
    });
  } catch (error) {
    logger.error(`Dashboard render error: ${error.message}`);
    
    // Fallback rendering for severe errors
    return res.status(200).send(`
      <html>
        <head>
          <title>Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .alert { background: #f8d7da; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
            a { color: blue; }
          </style>
        </head>
        <body>
          <h1>Dashboard</h1>
          <div class="alert">There was an error loading the dashboard. Our team has been notified.</div>
          <p><a href="/login">Try logging in again</a></p>
        </body>
      </html>
    `);
  }
});

module.exports = router; 