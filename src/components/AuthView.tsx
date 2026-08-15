import React, { useState } from 'react';
import { Bot, Sparkles, Shield, Lock, Mail, User as UserIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth/AuthContext';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setErrorMessage('Please provide your full name.');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setErrorMessage('Password must be at least 8 characters long.');
          setLoading(false);
          return;
        }
        await register(name.trim(), email.trim(), password, role);
        setSuccessMessage('Registration successful! Logging you in...');
      } else {
        await login(email.trim(), password);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-container"
      className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-white shadow-lg mb-4">
          <Bot className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          DocMind AI
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Enterprise Document Intelligence & Grounded Vector RAG
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-800/90 border border-slate-700/80 py-8 px-6 shadow-2xl rounded-2xl sm:px-10 backdrop-blur-md">
          <div className="flex border-b border-slate-700/80 mb-6">
            <button
              id="auth-tab-login"
              type="button"
              onClick={() => {
                setIsRegister(false);
                setErrorMessage(null);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 text-center transition-colors ${
                !isRegister
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              id="auth-tab-register"
              type="button"
              onClick={() => {
                setIsRegister(true);
                setErrorMessage(null);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 text-center transition-colors ${
                isRegister
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMessage && (
            <div
              id="auth-error-alert"
              className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              id="auth-success-alert"
              className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-sm flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password {isRegister && <span className="text-slate-400 normal-case font-normal">(min 8 characters)</span>}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password-input"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Account Role
                </label>
                <select
                  id="auth-role-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'USER' | 'ADMIN')}
                  className="w-full px-3 py-2 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="USER">Standard User (Isolated Documents & Vectors)</option>
                  <option value="ADMIN">Administrator (Full Security & Audit Center)</option>
                </select>
              </div>
            )}

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <span>Processing...</span>
              ) : isRegister ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Account</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Sign In Securely</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-700/60 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <Shield className="w-3.5 h-3.5" />
              <span>Multi-Tenant Document & Vector Isolation Enabled</span>
            </div>
            <p className="text-slate-400 text-xs">
              Every document and neural embedding vector is strictly isolated and accessible only by its authenticated owner.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
