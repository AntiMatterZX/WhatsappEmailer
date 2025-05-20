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
      id: user._id.toString(), // Ensure ID is a string
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    // Set user session with forceful save to ensure persistence in serverless environment
    req.session.user = sessionUser;
    
    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        logger.error(`Session save error: ${err.message}`);
        req.flash('error', 'Login error: Session could not be saved');
        return res.redirect('/login');
      }
      
      logger.info(`User logged in: ${username}, SessionID: ${req.sessionID}`);
      
      // Redirect to original requested page or default to dashboard
      const returnTo = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      
      return res.redirect(returnTo);
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    req.flash('error', 'An error occurred during login');
    res.redirect('/login');
  }
});

/**
 * GET /logout - Process logout
 */
router.get('/logout', isAuthenticated, (req, res) => {
  const username = req.session.user?.username;
  
  req.session.destroy((err) => {
    if (err) {
      logger.error(`Logout error: ${err.message}`);
      return res.redirect('/dashboard');
    }
    
    logger.info(`User logged out: ${username}`);
    res.redirect('/login');
  });
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
  // Check if there's a tab parameter in the URL
  const tab = req.query.tab || 'overview';
  
  // If the tab is "settings", redirect to the settings page
  if (tab === 'settings') {
    return res.redirect('/settings');
  }
  
  res.render('dashboard', {
    title: 'Overview - WhatsApp Bot Admin',
    user: req.session.user,
    activeTab: tab
  });
});

module.exports = router; 