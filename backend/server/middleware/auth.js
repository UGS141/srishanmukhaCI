import jwt from 'jsonwebtoken';
import { AdminUser } from '../models/AdminUser.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    console.error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
    return res.status(500).json({ success: false, message: 'Internal server configuration error.' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'access' || !decoded.sub) {
      return res.status(401).json({ success: false, message: 'Invalid session token.' });
    }

    const user = await AdminUser.findById(decoded.sub).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Session user account no longer exists.' });
    }

    if (user.status === 'DISABLED' || Number(user.sessionVersion || 0) !== Number(decoded.sessionVersion || 0)) {
      return res.status(401).json({ success: false, message: 'Session has been revoked.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
  }
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'SUPER ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. You do not have authorization for this module.',
      });
    }
    next();
  };
};

export const ROLE_PERMISSIONS = Object.freeze({
  'SUPER ADMIN': ['*'],
  ADMIN: ['dashboard:read', 'courses:write', 'batches:write', 'leads:read', 'leads:write', 'students:write', 'certificates:write', 'content:write', 'audit:read'],
  COUNSELLOR: ['dashboard:read', 'leads:read', 'leads:write', 'students:write', 'certificates:read'],
  'CONTENT MANAGER': ['dashboard:read', 'courses:write', 'batches:write', 'content:write'],
  TRAINER: ['dashboard:read', 'students:read'],
  'PLACEMENT MANAGER': ['dashboard:read', 'students:read', 'placements:write'],
  VIEWER: ['dashboard:read', 'courses:read', 'batches:read', 'leads:read', 'students:read', 'content:read', 'audit:read'],
});

export const authorizePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  const permissions = ROLE_PERMISSIONS[req.user.role] || [];
  if (!permissions.includes('*') && !permissions.includes(permission)) {
    return res.status(403).json({ success: false, message: 'Permission denied.' });
  }
  next();
};

