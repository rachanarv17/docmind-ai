import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface StructuredLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
  event: string;
  requestId?: string;
  userId?: string;
  method?: string;
  route?: string;
  statusCode?: number;
  latencyMs?: number;
  ip?: string;
  details?: Record<string, unknown> | string;
  error?: string;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpass',
  'newpass',
  'authorization',
  'cookie',
  'token',
  'auth_secret',
  'gemini_api_key',
  'qdrant_api_key',
  'apikey',
  'secret',
]);

export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }
  if (typeof data === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        cleaned[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        cleaned[key] = redactSensitiveData(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
  return data;
}

export function logStructured(log: StructuredLog): void {
  const sanitizedDetails = log.details ? redactSensitiveData(log.details) : undefined;
  const payload = {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
    details: sanitizedDetails,
  };

  const output = JSON.stringify(payload);
  if (log.level === 'ERROR' || log.level === 'SECURITY') {
    console.error(output);
  } else if (log.level === 'WARN') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

// Extend Express Request to have custom ID and startTime
declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

export function requestCorrelationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingId = req.header('x-request-id');
  const requestId =
    incomingId && /^[a-zA-Z0-9_-]{1,64}$/.test(incomingId)
      ? incomingId
      : `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  req.id = requestId;
  req.startTime = Date.now();
  res.setHeader('X-Request-ID', requestId);

  // Log on response finish
  res.on('finish', () => {
    const latencyMs = req.startTime ? Date.now() - req.startTime : 0;
    // Don't flood logs for Vite HMR / asset queries unless they are API calls or errors
    if (req.path.startsWith('/api')) {
      const level =
        res.statusCode >= 500
          ? 'ERROR'
          : res.statusCode >= 400
          ? 'WARN'
          : 'INFO';

      logStructured({
        timestamp: new Date().toISOString(),
        level,
        event: 'HTTP_REQUEST',
        requestId: req.id,
        userId: (req as any).user?.id,
        method: req.method,
        route: req.baseUrl + req.path,
        statusCode: res.statusCode,
        latencyMs,
        ip: req.ip || req.socket.remoteAddress,
      });
    }
  });

  next();
}
