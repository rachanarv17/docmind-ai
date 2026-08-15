import fs from 'fs';
import path from 'path';
import { User, UserRole, UserStatus, UserWithPasswordHash } from '../../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers(): Record<string, UserWithPasswordHash> {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), 'utf-8');
    return {};
  }
  try {
    const content = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(content || '{}');
  } catch (err) {
    console.error('Error reading users file:', err);
    return {};
  }
}

function saveUsers(users: Record<string, UserWithPasswordHash>): void {
  ensureDataDir();
  const tempFile = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(users, null, 2), 'utf-8');
  fs.renameSync(tempFile, USERS_FILE);
}

export function toSafeUser(user: UserWithPasswordHash): User {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function getUserById(id: string): UserWithPasswordHash | null {
  const users = loadUsers();
  return users[id] || null;
}

export function getUserByEmail(email: string): UserWithPasswordHash | null {
  const normalized = email.trim().toLowerCase();
  const users = loadUsers();
  for (const user of Object.values(users)) {
    if (user.email.toLowerCase() === normalized) {
      return user;
    }
  }
  return null;
}

export function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  status?: UserStatus;
}): User {
  const users = loadUsers();
  const normalizedEmail = data.email.trim().toLowerCase();

  for (const existing of Object.values(users)) {
    if (existing.email.toLowerCase() === normalizedEmail) {
      throw new Error('Email already registered');
    }
  }

  const isFirstUser = Object.keys(users).length === 0;
  const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = Date.now();

  const newUser: UserWithPasswordHash = {
    id,
    name: data.name.trim(),
    email: normalizedEmail,
    passwordHash: data.passwordHash,
    role: data.role || (isFirstUser ? 'ADMIN' : 'USER'),
    status: data.status || 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  users[id] = newUser;
  saveUsers(users);
  return toSafeUser(newUser);
}

export function updateUser(
  id: string,
  updates: Partial<Omit<UserWithPasswordHash, 'id' | 'createdAt'>>
): User | null {
  const users = loadUsers();
  const user = users[id];
  if (!user) return null;

  if (updates.email) {
    const normalized = updates.email.trim().toLowerCase();
    for (const [otherId, other] of Object.entries(users)) {
      if (otherId !== id && other.email.toLowerCase() === normalized) {
        throw new Error('Email already in use by another account');
      }
    }
    user.email = normalized;
  }

  if (updates.name !== undefined) user.name = updates.name.trim();
  if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;
  if (updates.role !== undefined) user.role = updates.role;
  if (updates.status !== undefined) user.status = updates.status;
  user.updatedAt = Date.now();

  users[id] = user;
  saveUsers(users);
  return toSafeUser(user);
}

export function getAllUsers(): User[] {
  const users = loadUsers();
  return Object.values(users).map(toSafeUser);
}

export function getUsersStats(): { total: number; active: number; suspended: number; admins: number } {
  const users = Object.values(loadUsers());
  return {
    total: users.length,
    active: users.filter((u) => u.status === 'ACTIVE').length,
    suspended: users.filter((u) => u.status === 'SUSPENDED').length,
    admins: users.filter((u) => u.role === 'ADMIN').length,
  };
}

export function clearAllUsers(): void {
  saveUsers({});
}

export const userStore = {
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  updateUserStatus: (id: string, status: UserStatus) => updateUser(id, { status }),
  getAllUsers,
  getUsersStats,
  getAdminStats: () => {
    const stats = getUsersStats();
    return {
      totalUsers: stats.total,
      activeUsers: stats.active,
      suspendedUsers: stats.suspended,
      adminUsers: stats.admins,
      totalDocuments: 0,
      totalChunks: 0,
      indexingFailures: 0,
      totalAuditLogs: 0,
      recentSecurityEvents: 0,
    };
  },
  clearAllForTesting: clearAllUsers,
};
