import { Request, Response, NextFunction } from 'express';
import { logStructured } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

export function createError(
  message: string,
  statusCode = 500,
  code = 'INTERNAL_ERROR'
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.isOperational = true;
  return err;
}

export function centralErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const requestId = req.id || 'unknown';

  // Server-side structured error log (safe, redacted)
  logStructured({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    event: 'UNHANDLED_ERROR',
    requestId,
    userId: (req as any).user?.id,
    method: req.method,
    route: req.originalUrl || req.path,
    statusCode,
    error: err.message,
    details: {
      code: err.code || 'INTERNAL_ERROR',
      isOperational: Boolean(err.isOperational),
    },
  });

  // Production safe response (never leaks stack traces, paths, or secrets)
  const isProduction = process.env.NODE_ENV === 'production';
  const clientMessage =
    statusCode >= 500 && isProduction
      ? 'An unexpected error occurred. Please try again later.'
      : err.message || 'Internal server error';

  res.status(statusCode).json({
    error: {
      message: clientMessage,
      code: err.code || 'INTERNAL_SERVER_ERROR',
      requestId,
    },
  });
}
