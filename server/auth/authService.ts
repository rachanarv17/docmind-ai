import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../../src/types';
import {
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  toSafeUser,
} from '../db/userStore';
import { logAuditEvent } from '../db/auditStore';

// Read secret from environment, fallback to a persistent random secret per process
const AUTH_SECRET = process.env.AUTH_SECRET || 'docmind-ai-production-jwt-auth-secret-key-2026';
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 10;

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export const verifyPassword = comparePassword;

export function generateToken(user: User): string {
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export const generateAuthToken = generateToken;

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, AUTH_SECRET) as TokenPayload;
  } catch (err) {
    return null;
  }
}

export const verifyAuthToken = verifyToken;

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role?: UserRole
): Promise<{ user: User; token: string }> {
  if (!name || !name.trim()) {
    throw new Error('Name is required');
  }
  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const existing = getUserByEmail(email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const passwordHash = await hashPassword(password);
  const newUser = createUser({
    name,
    email,
    passwordHash,
    role,
  });

  const token = generateToken(newUser);

  logAuditEvent('REGISTER', {
    userId: newUser.id,
    userEmail: newUser.email,
    details: { role: newUser.role },
  });

  return { user: newUser, token };
}

export async function loginUser(
  email: string,
  password: string,
  ipAddress?: string
): Promise<{ user: User; token: string }> {
  if (!email || !password) {
    throw new Error('Invalid email or password');
  }

  const userWithHash = getUserByEmail(email);
  if (!userWithHash) {
    logAuditEvent('LOGIN_FAILURE', {
      userEmail: email,
      ipAddress,
      details: 'Account not found',
      severity: 'WARN',
    });
    throw new Error('Invalid email or password');
  }

  const isValid = await comparePassword(password, userWithHash.passwordHash);
  if (!isValid) {
    logAuditEvent('LOGIN_FAILURE', {
      userId: userWithHash.id,
      userEmail: userWithHash.email,
      ipAddress,
      details: 'Password mismatch',
      severity: 'WARN',
    });
    throw new Error('Invalid email or password');
  }

  if (userWithHash.status === 'SUSPENDED') {
    logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
      userId: userWithHash.id,
      userEmail: userWithHash.email,
      ipAddress,
      details: 'Suspended user attempted login',
      severity: 'SECURITY',
    });
    throw new Error('Account is suspended. Please contact an administrator.');
  }

  const safeUser = toSafeUser(userWithHash);
  const token = generateToken(safeUser);

  logAuditEvent('LOGIN_SUCCESS', {
    userId: safeUser.id,
    userEmail: safeUser.email,
    ipAddress,
  });

  return { user: safeUser, token };
}

export async function changeUserPassword(
  userId: string,
  currentPass: string,
  newPass: string,
  ipAddress?: string
): Promise<boolean> {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (!newPass || newPass.length < 8) {
    throw new Error('New password must be at least 8 characters long');
  }

  const isMatch = await comparePassword(currentPass, user.passwordHash);
  if (!isMatch) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await hashPassword(newPass);
  updateUser(userId, { passwordHash: newHash });

  logAuditEvent('PASSWORD_CHANGED', {
    userId: user.id,
    userEmail: user.email,
    ipAddress,
  });

  return true;
}

export const AUTH_COOKIE_NAME = 'docmind_auth_token';

export function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}
