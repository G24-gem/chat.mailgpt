/* ./middleware/auth.js */

/**
 * Express middleware — rejects unauthenticated requests with a clear JSON error.
 * Attach to any route that requires the user to be logged in.
 */
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.status(401).json({
    error: 'Authentication required.',
    hint:  'Please login with Google to continue.',
    loginUrl: '/auth/google',
  });
}

module.exports = { requireAuth };