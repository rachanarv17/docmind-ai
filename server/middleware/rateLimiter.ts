import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logAuditEvent } from '../db/auditStore';
import { extractClientIp } from './authMiddleware';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: Request) => extractClientIp(req) || '127.0.0.1',
  handler: (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    logAuditEvent('RATE_LIMIT_TRIGGERED', {
      ipAddress: ip,
      userId: req.user?.id,
      userEmail: req.user?.email,
      details: { route: req.originalUrl, method: req.method },
      severity: 'WARN',
    });
    res.status(429).json({
      error: 'Too many authentication attempts. Please wait 15 minutes before retrying.',
    });
  },
});

export const chatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: Request) => extractClientIp(req) || '127.0.0.1',
  handler: (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    logAuditEvent('RATE_LIMIT_TRIGGERED', {
      ipAddress: ip,
      userId: req.user?.id,
      userEmail: req.user?.email,
      details: { route: '/api/chat', limit: 60 },
      severity: 'WARN',
    });
    res.status(429).json({
      error: 'AI query rate limit exceeded. Please slow down.',
    });
  },
});

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 uploads per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: Request) => extractClientIp(req) || '127.0.0.1',
  handler: (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    logAuditEvent('RATE_LIMIT_TRIGGERED', {
      ipAddress: ip,
      userId: req.user?.id,
      userEmail: req.user?.email,
      details: { route: '/api/documents/upload', limit: 30 },
      severity: 'WARN',
    });
    res.status(429).json({
      error: 'Document upload limit exceeded. Please wait before uploading more files.',
    });
  },
});

export const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: Request) => extractClientIp(req) || '127.0.0.1',
  handler: (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    logAuditEvent('RATE_LIMIT_TRIGGERED', {
      ipAddress: ip,
      userId: req.user?.id,
      userEmail: req.user?.email,
      details: { route: req.originalUrl, limit: 300 },
      severity: 'WARN',
    });
    res.status(429).json({
      error: 'Rate limit exceeded. Please reduce request frequency.',
    });
  },
});
