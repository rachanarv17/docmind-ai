import { User, AuthResponse, AdminStats, AuditLogEntry } from '../../types';

export const AUTH_STORAGE_KEY = 'docmind_user_session';

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Ensure cookies are sent
  });

  if (response.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
    setStoredUser(null);
  }

  return response;
}

export async function registerApi(data: {
  name: string;
  email: string;
  password: string;
  role?: 'USER' | 'ADMIN';
}): Promise<AuthResponse> {
  const res = await authFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Registration failed');
  }

  setStoredUser(body.user);
  return body;
}

export async function loginApi(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Invalid email or password.');
  }

  setStoredUser(body.user);
  return body;
}

export async function logoutApi(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', {
      method: 'POST',
    });
  } finally {
    setStoredUser(null);
  }
}

export async function getMeApi(): Promise<User | null> {
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) {
      setStoredUser(null);
      return null;
    }
    const data = await res.json();
    if (data.user) {
      setStoredUser(data.user);
      return data.user;
    }
    return null;
  } catch {
    return null;
  }
}

export async function changePasswordApi(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await authFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to change password');
  }
  return body;
}

// Admin APIs
export async function getAdminStatsApi(): Promise<AdminStats> {
  const res = await authFetch('/api/admin/stats');
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch admin statistics');
  }
  return body.stats;
}

export async function getAdminUsersApi(): Promise<User[]> {
  const res = await authFetch('/api/admin/users');
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch users');
  }
  return body.users || [];
}

export async function updateUserStatusApi(userId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<User> {
  const res = await authFetch(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to update user status');
  }
  return body.user;
}

export async function getAdminAuditLogsApi(limit = 100): Promise<AuditLogEntry[]> {
  const res = await authFetch(`/api/admin/audit-logs?limit=${limit}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Failed to fetch audit logs');
  }
  return body.logs || [];
}
