import { Request, Response, NextFunction } from 'express';
import { verifyToken, AUTH_COOKIE_NAME } from '../auth/authService';
import { getUserById, toSafeUser } from '../db/userStore';
import { logAuditEvent } from '../db/auditStore';
import { User, UserRole } from '../../src/types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      clientIp?: string;
    }
  }
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function extractAuthToken(req: Request): string | null {
  // Check cookies first
  if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME];
  }
  // Check Authorization header (Bearer <token>)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

export function authenticateUser(req: Request, res: Response, next: NextFunction) {
  req.clientIp = extractClientIp(req);
  const token = extractAuthToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in to access this resource.',
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      error: 'Invalid or expired session. Please log in again.',
    });
  }

  const userWithHash = getUserById(payload.userId);
  if (!userWithHash) {
    return res.status(401).json({
      error: 'User account not found.',
    });
  }

  if (userWithHash.status === 'SUSPENDED') {
    logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
      userId: userWithHash.id,
      userEmail: userWithHash.email,
      ipAddress: req.clientIp,
      details: 'Suspended user attempted API access',
      severity: 'SECURITY',
    });
    return res.status(403).json({
      error: 'Account is suspended. Please contact an administrator.',
    });
  }

  req.user = toSafeUser(userWithHash);
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  req.clientIp = extractClientIp(req);
  const token = extractAuthToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const userWithHash = getUserById(payload.userId);
      if (userWithHash && userWithHash.status === 'ACTIVE') {
        req.user = toSafeUser(userWithHash);
      }
    }
  }
  next();
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== role && req.user.role !== 'ADMIN') {
      logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
        userId: req.user.id,
        userEmail: req.user.email,
        ipAddress: req.clientIp || extractClientIp(req),
        details: `Access denied: user with role ${req.user.role} attempted to access ${role}-only endpoint`,
        severity: 'SECURITY',
      });
      return res.status(403).json({
        error: 'Forbidden: Insufficient permissions for this resource.',
      });
    }

    next();
  };
}

export function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Account is not active' });
  }
  next();
}
