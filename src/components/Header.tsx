import React from 'react';
import { Bot, Sparkles, Bell, Search, Shield, LogOut, User as UserIcon } from 'lucide-react';
import { NavTab } from '../types';
import { useAuth } from '../lib/auth/AuthContext';

interface HeaderProps {
  activeTab: NavTab;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  searchQuery,
  onSearchChange,
}) => {
  const { user, logout, isAdmin } = useAuth();

  const getTabTitle = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'documents':
        return 'Document Repository';
      case 'chat':
        return 'AI Document Chat';
      case 'settings':
        return 'System Settings';
      case 'admin':
        return 'Security & Admin Center';
    }
  };

  return (
    <header
      id="app-header"
      className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 shadow-xs"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xs">
          <Bot className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              DocMind AI
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Sparkles className="w-3 h-3 text-indigo-600" /> v1.0
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Enterprise Document Intelligence & Grounded Vector RAG
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="global-search-input"
            type="text"
            placeholder="Search insights or documents..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-colors"
          />
        </div>

        <button
          id="header-notification-btn"
          title="Notifications"
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-600 rounded-full"></span>
        </button>

        {user && (
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="hidden lg:block text-left text-xs">
                <div className="font-semibold text-slate-900 truncate max-w-[120px]">
                  {user.name}
                </div>
                <div className="text-slate-400 font-mono truncate max-w-[120px]">
                  {user.role}
                </div>
              </div>
            </div>

            <button
              id="header-logout-btn"
              onClick={logout}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="hidden xl:flex items-center pl-3 border-l border-slate-200 text-xs font-medium text-slate-600">
          <span>{getTabTitle(activeTab)}</span>
        </div>
      </div>
    </header>
  );
};
