import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  FileText,
  Layers,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Eye,
} from 'lucide-react';
import { AdminStats, User, AuditLogEntry, AuditEventType } from '../types';
import {
  getAdminStatsApi,
  getAdminUsersApi,
  updateUserStatusApi,
  getAdminAuditLogsApi,
} from '../lib/auth/authClient';

export const AdminView: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userSearch, setUserSearch] = useState<string>('');
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('ALL');
  const [inspectingLog, setInspectingLog] = useState<AuditLogEntry | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const [fetchedStats, fetchedUsers, fetchedLogs] = await Promise.all([
        getAdminStatsApi(),
        getAdminUsersApi(),
        getAdminAuditLogsApi(150),
      ]);
      setStats(fetchedStats);
      setUsers(fetchedUsers);
      setAuditLogs(fetchedLogs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load admin data';
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStatus = async (userId: string, currentStatus: 'ACTIVE' | 'SUSPENDED') => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
      await updateUserStatusApi(userId, newStatus);
      setActionSuccess(`User status updated to ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setActionError(msg);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.id.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredLogs = auditLogs.filter((log) => {
    if (selectedEventFilter !== 'ALL' && log.event !== selectedEventFilter) return false;
    if (selectedSeverityFilter !== 'ALL' && log.severity !== selectedSeverityFilter) return false;
    return true;
  });

  return (
    <div id="admin-view" className="space-y-8 animate-fade-in">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h2 className="text-2xl font-bold text-slate-900">Security & Administration Center</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time multi-tenant monitoring, RBAC user governance, and security audit log streams.
          </p>
        </div>

        <button
          id="admin-refresh-btn"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Registered Users</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats?.totalUsers ?? 0}</div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="text-emerald-600 font-semibold">{stats?.activeUsers ?? 0} Active</span>
            <span>•</span>
            <span className="text-rose-600 font-semibold">{stats?.suspendedUsers ?? 0} Suspended</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Documents</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats?.totalDocuments ?? 0}</div>
          <div className="text-xs text-slate-500">
            Across all isolated tenant workspaces
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Vector Chunks</span>
            <Layers className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats?.totalChunks ?? 0}</div>
          <div className="text-xs text-slate-500">
            Persisted in Qdrant with tenant payload isolation
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Security Events</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{stats?.recentSecurityEvents ?? 0}</div>
          <div className="text-xs text-slate-500">
            Audit alerts / unauthorized attempts
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">User Account Governance</h3>
            <p className="text-xs text-slate-500">Manage tenant permissions and account statuses</p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="admin-user-search-input"
              type="text"
              placeholder="Search user name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Registered</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No users matching search query.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          user.role === 'ADMIN'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          user.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {user.status === 'ACTIVE' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-600" />
                        )}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        id={`user-toggle-status-${user.id}`}
                        onClick={() => handleToggleStatus(user.id, user.status)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          user.status === 'ACTIVE'
                            ? 'border-red-200 text-red-700 hover:bg-red-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {user.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate Account'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Audit Log Explorer */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Security Audit Logs</h3>
            <p className="text-xs text-slate-500">
              Immutable stream of authentication, document access, and security events
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Event:</span>
              <select
                id="admin-audit-event-filter"
                value={selectedEventFilter}
                onChange={(e) => setSelectedEventFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">All Events</option>
                <option value="REGISTER">REGISTER</option>
                <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                <option value="LOGIN_FAILURE">LOGIN_FAILURE</option>
                <option value="DOCUMENT_UPLOADED">DOCUMENT_UPLOADED</option>
                <option value="DOCUMENT_DELETED">DOCUMENT_DELETED</option>
                <option value="DOCUMENT_REINDEXED">DOCUMENT_REINDEXED</option>
                <option value="UNAUTHORIZED_DOCUMENT_ACCESS">UNAUTHORIZED_ACCESS</option>
                <option value="RATE_LIMIT_TRIGGERED">RATE_LIMIT</option>
                <option value="PROMPT_INJECTION_DETECTED">PROMPT_INJECTION</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span>Severity:</span>
              <select
                id="admin-audit-severity-filter"
                value={selectedSeverityFilter}
                onChange={(e) => setSelectedSeverityFilter(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">All Severities</option>
                <option value="SECURITY">SECURITY (High)</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 uppercase font-semibold text-slate-500 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">Event</th>
                <th className="px-6 py-3">User Identity</th>
                <th className="px-6 py-3">IP Address</th>
                <th className="px-6 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 font-sans">
                    No audit logs matching selected filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      log.severity === 'SECURITY'
                        ? 'bg-rose-50/30'
                        : log.severity === 'WARN'
                        ? 'bg-amber-50/30'
                        : ''
                    }`}
                  >
                    <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          log.severity === 'SECURITY'
                            ? 'bg-red-100 text-red-800'
                            : log.severity === 'WARN'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-900">{log.event}</td>
                    <td className="px-6 py-3 text-slate-700">
                      {log.userEmail || log.userId || 'anonymous'}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{log.ipAddress || 'unknown'}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => setInspectingLog(log)}
                        className="text-indigo-600 hover:text-indigo-800 font-sans font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Details Modal */}
      {inspectingLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                <h4 className="text-lg font-bold text-slate-900">Audit Log Details</h4>
              </div>
              <button
                onClick={() => setInspectingLog(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-sm text-slate-700">
              <div>
                <span className="font-semibold text-slate-900">Event ID:</span>{' '}
                <span className="font-mono text-xs">{inspectingLog.id}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">Event Type:</span>{' '}
                <span className="font-mono text-xs">{inspectingLog.event}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-900">Timestamp:</span>{' '}
                {new Date(inspectingLog.timestamp).toLocaleString()}
              </div>
              <div>
                <span className="font-semibold text-slate-900">User:</span>{' '}
                {inspectingLog.userEmail || inspectingLog.userId || 'N/A'}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Client IP:</span>{' '}
                {inspectingLog.ipAddress || 'Unknown'}
              </div>
              {inspectingLog.resourceId && (
                <div>
                  <span className="font-semibold text-slate-900">Resource ID:</span>{' '}
                  <span className="font-mono text-xs">{inspectingLog.resourceId}</span>
                </div>
              )}
              <div className="pt-2">
                <div className="font-semibold text-slate-900 mb-1">Payload / Details:</div>
                <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-xs overflow-x-auto max-h-48 font-mono">
                  {JSON.stringify(inspectingLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectingLog(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
