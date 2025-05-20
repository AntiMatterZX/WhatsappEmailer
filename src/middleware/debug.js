/**
 * Debug middleware for diagnosing session and auth issues
 * Especially useful for serverless environments like Vercel
 */

const logger = require('../utils/logger');

/**
 * Middleware to log detailed request and session information
 * Helps diagnose authentication issues in Vercel environment
 */
function debugMiddleware(req, res, next) {
  // Don't log for static resources to avoid noise
  if (req.path.startsWith('/css/') || 
      req.path.startsWith('/js/') || 
      req.path.startsWith('/img/')) {
    return next();
  }
  
  try {
    // Basic request information
    const method = req.method;
    const path = req.path;
    
    // Session information - with safe access
    const sessionID = req.sessionID || 'no-session-id';
    const hasSession = !!req.session;
    const hasUser = !!(req.session && req.session.user);
    
    // Simple log entry to avoid potential serialization issues
    logger.debug(`REQUEST: ${method} ${path} | Session: ${sessionID} | LoggedIn: ${hasUser}`);
    
    // Safely attach debug info to response locals
    res.locals.debugInfo = {
      sessionExists: hasSession,
      userExists: hasUser
    };
  } catch (error) {
    // Fail safe - don't let debug middleware crash the app
    logger.error('Debug middleware error:', error.message);
  }
  
  // Always continue to next middleware
  next();
}

module.exports = debugMiddleware; 