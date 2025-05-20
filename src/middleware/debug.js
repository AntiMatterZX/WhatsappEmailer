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
  
  const now = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const sessionID = req.sessionID || 'no-session-id';
  const hasSession = !!(req.session);
  const hasUser = !!(req.session && req.session.user);
  const username = hasUser ? req.session.user.username : 'not-logged-in';
  
  // Create a debug log entry
  const logEntry = {
    time: now,
    method,
    path,
    sessionID,
    hasSession,
    hasUser,
    username,
    userAgent: req.get('User-Agent'),
    cookies: req.cookies ? Object.keys(req.cookies).join(',') : 'none',
    host: req.get('Host'),
    deployment: process.env.VERCEL ? 'Vercel' : 'Non-Vercel'
  };
  
  // Log the entry
  logger.debug(`REQUEST: ${method} ${path} | Session: ${sessionID} | User: ${username}`, { debug: logEntry });
  
  // Attach debug info to the response for potential client-side debugging
  res.locals.debugInfo = {
    sessionExists: hasSession,
    userExists: hasUser,
    timestamp: now
  };
  
  next();
}

module.exports = debugMiddleware; 