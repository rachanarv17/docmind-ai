import React from 'react';
import {
  LayoutDashboard,
  FileText,
  MessageSquareQuote,
  Settings,
  ShieldAlert,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { NavTab } from '../types';
import { useAuth } from '../lib/auth/AuthContext';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  documentCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  documentCount,
}) => {
  const { user, logout, isAdmin } = useAuth();

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number; adminOnly?: boolean }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <FileText className="w-4 h-4" />,
      badge: documentCount,
    },
    {
      id: 'chat',
      label: 'AI Chat',
      icon: <MessageSquareQuote className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
    },
    {
      id: 'admin',
      label: 'Admin & Audit',
      icon: <ShieldAlert className="w-4 h-4" />,
      adminOnly: true,
    },
  ];

  return (
    <aside
      id="app-sidebar"
      className="w-full md:w-64 bg-slate-900 text-slate-200 p-4 shrink-0 flex flex-col justify-between border-r border-slate-800"
    >
      <div className="space-y-6">
        <div>
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </div>
          <nav className="space-y-1 mt-2">
            {navItems
              .filter((item) => !item.adminOnly || isAdmin)
              .map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={isActive ? 'text-white' : 'text-slate-400'}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          isActive
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
          </nav>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-semibold">Tenant Isolation</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Authenticated as <strong className="text-white">{user?.name || 'User'}</strong> ({user?.role || 'USER'}). Vectors and queries strictly filtered.
          </p>
        </div>
      </div>

      {user && (
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between px-2 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <div className="font-semibold text-slate-200 truncate">{user.name}</div>
              <div className="text-slate-500 truncate">{user.email}</div>
            </div>
          </div>
          <button
            id="sidebar-logout-btn"
            onClick={logout}
            title="Sign Out"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
};
