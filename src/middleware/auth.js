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
  // If there's no session object at all, we definitely need to redirect
  if (!req.session) {
    logger.error('No session object found in request - possible session store connection issue');
    req.flash('error', 'Session error: Please try logging in again');
    return res.redirect('/login');
  }
  
  // Debug logging for session troubleshooting
  logger.debug(`Auth check - SessionID: ${req.sessionID}, Has user: ${!!req.session.user}`);
  
  if (req.session.user) {
    // Session exists and has user object
    return next();
  }
  
  // Store the requested URL to redirect after login
  req.session.returnTo = req.originalUrl;
  
  // Force session save to ensure returnTo is persisted
  req.session.save((err) => {
    if (err) {
      logger.error(`Session save error in auth middleware: ${err.message}`);
    }
    
    req.flash('error', 'Please login to access this page');
    return res.redirect('/login');
  });
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
    
    logger.warn(`Unauthorized role access attempt by user: ${req.session.user.username}. Required: ${requiredRoles.join(', ')}, Found: ${userRole}`);
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