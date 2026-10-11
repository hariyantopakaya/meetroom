function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to perform this action.',
      });
    }

    next();
  };
}

const requireAdmin = requireRole('ADMIN');
const requireStaff = requireRole(['ADMIN', 'RECEPTIONIST']);

module.exports = {
  requireRole,
  requireAdmin,
  requireStaff,
};
