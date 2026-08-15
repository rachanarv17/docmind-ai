import fs from 'fs';
import path from 'path';
import { AuditEventType, AuditLogEntry } from '../../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');
const MAX_PERSISTED_LOGS = 5000;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

let inMemoryLogs: AuditLogEntry[] = [];

function loadLogs(): AuditLogEntry[] {
  ensureDataDir();
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  try {
    const content = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const parsed = JSON.parse(content || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading audit logs file:', err);
    return [];
  }
}

// Initialize in-memory cache
inMemoryLogs = loadLogs();

function saveLogs(logs: AuditLogEntry[]): void {
  ensureDataDir();
  const trimmed = logs.slice(0, MAX_PERSISTED_LOGS);
  const tempFile = `${AUDIT_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(trimmed, null, 2), 'utf-8');
  fs.renameSync(tempFile, AUDIT_FILE);
}

// Redact any potential sensitive fields like passwords, tokens, API keys
function sanitizeDetails(details: unknown): Record<string, unknown> | string | undefined {
  if (!details) return undefined;
  if (typeof details === 'string') {
    return details.replace(/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED]');
  }
  if (typeof details === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('key') ||
        lower.includes('auth')
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  return undefined;
}

export type AuditLogParams = {
  event?: AuditEventType;
  severity?: 'INFO' | 'WARN' | 'SECURITY';
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  resourceId?: string;
  details?: Record<string, unknown> | string;
};

export function logAuditEvent(
  eventOrParams: AuditEventType | AuditLogParams,
  optionalParams?: Omit<AuditLogParams, 'event'>
): AuditLogEntry {
  let event: AuditEventType;
  let params: Omit<AuditLogParams, 'event'>;

  if (typeof eventOrParams === 'string') {
    event = eventOrParams as AuditEventType;
    params = optionalParams || {};
  } else {
    event = eventOrParams.event || 'SYSTEM_INFO';
    params = eventOrParams;
  }

  const timestamp = Date.now();
  const entry: AuditLogEntry = {
    id: `audit_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp,
    formattedDate: new Date(timestamp).toLocaleString(),
    event,
    severity: params.severity || 'INFO',
    userId: params.userId,
    userEmail: params.userEmail,
    ipAddress: params.ipAddress,
    resourceId: params.resourceId,
    details: sanitizeDetails(params.details),
  };

  inMemoryLogs.unshift(entry);
  if (inMemoryLogs.length > MAX_PERSISTED_LOGS) {
    inMemoryLogs = inMemoryLogs.slice(0, MAX_PERSISTED_LOGS);
  }

  saveLogs(inMemoryLogs);
  return entry;
}

export function queryAuditLogs(options?: {
  userId?: string;
  event?: AuditEventType;
  severity?: 'INFO' | 'WARN' | 'SECURITY';
  startTime?: number;
  endTime?: number;
  limit?: number;
}): AuditLogEntry[] {
  let filtered = [...inMemoryLogs];

  if (options?.userId) {
    filtered = filtered.filter((log) => log.userId === options.userId);
  }

  if (options?.event) {
    filtered = filtered.filter((log) => log.event === options.event);
  }

  if (options?.severity) {
    filtered = filtered.filter((log) => log.severity === options.severity);
  }

  if (options?.startTime) {
    filtered = filtered.filter((log) => log.timestamp >= options.startTime!);
  }

  if (options?.endTime) {
    filtered = filtered.filter((log) => log.timestamp <= options.endTime!);
  }

  const limit = options?.limit || 100;
  return filtered.slice(0, limit);
}

export const getAuditLogs = queryAuditLogs;

export function countSecurityEvents(sinceTimestamp = Date.now() - 24 * 60 * 60 * 1000): number {
  return inMemoryLogs.filter(
    (log) => log.severity === 'SECURITY' && log.timestamp >= sinceTimestamp
  ).length;
}

export function getAuditStats() {
  const securityEvents = countSecurityEvents();
  return {
    totalLogs: inMemoryLogs.length,
    securityEvents,
    securityEventsCount: securityEvents,
  };
}

export function clearAllAuditLogs(): void {
  inMemoryLogs = [];
  saveLogs([]);
}

export const auditStore = {
  logEvent: logAuditEvent,
  getLogs: (limit = 100) => queryAuditLogs({ limit }),
  getAuditLogs,
  getAuditStats,
  queryAuditLogs,
  countSecurityEvents,
  clearAllForTesting: clearAllAuditLogs,
};
