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
  
  // Vercel compatibility - check for backup auth cookie
  if (req.cookies && req.cookies.wa_auth_backup) {
    try {
      const backupAuth = JSON.parse(req.cookies.wa_auth_backup);
      
      // Verify it's not expired
      if (backupAuth && backupAuth.exp && backupAuth.exp > Date.now()) {
        logger.info(`Using backup cookie auth for user: ${backupAuth.username}`);
        
        // Create a session user from the backup cookie
        if (!req.session) {
          req.session = {}; // Create minimal session object
        }
        
        // Set user in session
        req.session.user = {
          username: backupAuth.username,
          role: backupAuth.role
        };
        
        return next();
      } else {
        // Cookie expired, clear it
        res.clearCookie('wa_auth_backup');
      }
    } catch (error) {
      logger.error('Backup auth cookie processing error:', error.message);
      // Continue to next auth method
    }
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
  // Check session first
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  // Check backup auth cookie for Vercel environment
  if (req.cookies && req.cookies.wa_auth_backup) {
    try {
      const backupAuth = JSON.parse(req.cookies.wa_auth_backup);
      
      // Verify it's not expired and has admin role
      if (backupAuth && backupAuth.exp && backupAuth.exp > Date.now() && backupAuth.role === 'admin') {
        logger.info(`Using backup cookie admin auth for user: ${backupAuth.username}`);
        
        // Create a session user from the backup cookie if needed
        if (!req.session) {
          req.session = {}; // Create minimal session object
        }
        
        if (!req.session.user) {
          // Set user in session
          req.session.user = {
            username: backupAuth.username,
            role: backupAuth.role
          };
        }
        
        return next();
      }
    } catch (error) {
      logger.error('Backup auth cookie processing error in isAdmin:', error.message);
      // Continue to unauthorized response
    }
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
  // Check session first
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  
  // Also check for backup auth cookie for Vercel environment
  if (req.cookies && req.cookies.wa_auth_backup) {
    try {
      const backupAuth = JSON.parse(req.cookies.wa_auth_backup);
      
      // Verify it's not expired
      if (backupAuth && backupAuth.exp && backupAuth.exp > Date.now()) {
        // Valid backup auth cookie - redirect to dashboard
        return res.redirect('/dashboard');
      }
    } catch (error) {
      // Ignore errors with backup cookie - just continue as not authenticated
      logger.debug('Backup auth cookie processing error in isNotAuthenticated:', error.message);
    }
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
    // Check session for role first
    if (req.session && req.session.user) {
      const userRole = req.session.user.role;
      const requiredRoles = Array.isArray(roles) ? roles : [roles];
      
      if (requiredRoles.includes(userRole) || userRole === 'admin') {
        return next();
      }
      
      // Session exists but role is not sufficient
      const username = req.session.user.username || 'unknown';
      logger.warn(`Unauthorized role access attempt by user: ${username}. Required: ${requiredRoles.join(', ')}, Found: ${userRole}`);
      return res.status(403).render('error', { 
        error: {
          status: 403,
          message: 'Forbidden: You do not have the required permissions'
        }
      });
    }
    
    // Check backup auth cookie for Vercel environment
    if (req.cookies && req.cookies.wa_auth_backup) {
      try {
        const backupAuth = JSON.parse(req.cookies.wa_auth_backup);
        const requiredRoles = Array.isArray(roles) ? roles : [roles];
        
        // Verify it's not expired and has required role
        if (backupAuth && backupAuth.exp && backupAuth.exp > Date.now() && 
            (requiredRoles.includes(backupAuth.role) || backupAuth.role === 'admin')) {
          
          logger.info(`Using backup cookie role auth for user: ${backupAuth.username}`);
          
          // Create a session user from the backup cookie
          if (!req.session) {
            req.session = {}; // Create minimal session object
          }
          
          // Set user in session
          req.session.user = {
            username: backupAuth.username,
            role: backupAuth.role
          };
          
          return next();
        }
      } catch (error) {
        logger.error('Backup auth cookie processing error in hasRole:', error.message);
        // Continue to unauthorized response
      }
    }
    
    // No valid session or cookie - redirect to login
    return res.redirect('/login');
  };
}

module.exports = {
  isAuthenticated,
  isAdmin,
  isNotAuthenticated,
  hasRole
}; 