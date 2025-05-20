/**
 * Authentication middleware for protecting routes
 * Verifies user authentication and handles authorization based on roles
 */

const logger = require('../utils/logger');

/**
 * Middleware to check if user is authenticated
 * Redirects to login page if not authenticated
 */
function isAuthenticated(req, res, next) {
  // First check for session authentication
  if (req.session && req.session.user) {
    return next();
  }
  
  // Vercel compatibility - check for authorization header as fallback
  // This could be used with a token-based approach if sessions fail
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      // Basic auth header (for emergency access if session store fails)
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');
      
      // Emergency access with admin credentials
      // This is basic, but a fallback if session store is failing
      if (username === process.env.ADMIN_USERNAME && 
          password === process.env.ADMIN_PASSWORD) {
        logger.warn(`Emergency admin access via Basic Auth for ${username}`);
        
        // Continue to protected route
        return next();
      }
    } catch (error) {
      logger.error('Auth header processing error:', error.message);
    }
  }
  
  // Store original URL
  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }
  
  // Not authenticated, redirect to login
  req.flash('error', 'Please login to access this page');
  return res.redirect('/login');
}

/**
 * Middleware to check if user has admin role
 * Renders 403 forbidden page if not authorized
 */
function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  logger.warn(`Unauthorized admin access attempt by user: ${req.session?.user?.username || 'unknown'}`);
  return res.status(403).render('error', { 
    error: {
      status: 403,
      message: 'Forbidden: Admin access required'
    }
  });
}

/**
 * Middleware to ensure user is not authenticated
 * Redirects to dashboard if already authenticated
 */
function isNotAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return next();
}

/**
 * Creates middleware to check for specific role
 * @param {string|Array} roles - Required role(s) to access the route
 * @returns {Function} - Express middleware function
 */
function hasRole(roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    
    const userRole = req.session.user.role;
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    if (requiredRoles.includes(userRole) || userRole === 'admin') {
      return next();
    }
    
    const username = req.session.user.username || 'unknown';
    logger.warn(`Unauthorized role access attempt by user: ${username}. Required: ${requiredRoles.join(', ')}, Found: ${userRole}`);
    return res.status(403).render('error', { 
      error: {
        status: 403,
        message: 'Forbidden: You do not have the required permissions'
      }
    });
  };
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isNotAuthenticated,
  hasRole
}; 