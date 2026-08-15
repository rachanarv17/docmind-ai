import React, { useState } from 'react';
import {
  Settings,
  Cpu,
  Sliders,
  CheckCircle2,
  Database,
  Layers,
  HelpCircle,
  Zap,
} from 'lucide-react';
import { UserSettings } from '../types';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [savedToast, setSavedToast] = useState(false);

  const handleSave = () => {
    onUpdateSettings(localSettings);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  return (
    <div id="settings-view" className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">RAG Engine & Ingestion Settings</h2>
        <p className="text-xs text-slate-500">
          Configure dense vector embeddings, hybrid retrieval weights, chunking parameters, and model settings.
        </p>
      </div>

      {savedToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Settings successfully saved.
        </div>
      )}

      {/* Vector Embeddings & RAG Retrieval Card (Phase 3) */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Vector Embeddings & Hybrid Search (Phase 3)</h3>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
            Active
          </span>
        </div>

        <div className="space-y-4 text-sm">
          {/* Hybrid Alpha Balance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800 text-xs block">
                  Hybrid Search Balance (α = {localSettings.vectorSearchConfig.hybridAlpha}):{' '}
                  <span className="text-indigo-600">
                    {(localSettings.vectorSearchConfig.hybridAlpha * 100).toFixed(0)}% Dense Semantic
                  </span>{' '}
                  +{' '}
                  <span className="text-slate-600">
                    {((1 - localSettings.vectorSearchConfig.hybridAlpha) * 100).toFixed(0)}% Sparse BM25
                  </span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Combines high-dimensional dense vector embeddings with exact BM25 keyword matching
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-600">
                α = {localSettings.vectorSearchConfig.hybridAlpha}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={localSettings.vectorSearchConfig.hybridAlpha}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  vectorSearchConfig: {
                    ...localSettings.vectorSearchConfig,
                    hybridAlpha: parseFloat(e.target.value),
                  },
                })
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Top-K Retrieval */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800 text-xs block">
                  Top-K Context Chunks: {localSettings.vectorSearchConfig.topK} Chunks
                </span>
                <span className="text-[11px] text-slate-400">
                  Number of highest-ranked chunks passed to the RAG synthesis prompt
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-600">
                {localSettings.vectorSearchConfig.topK} chunks
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={localSettings.vectorSearchConfig.topK}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  vectorSearchConfig: {
                    ...localSettings.vectorSearchConfig,
                    topK: parseInt(e.target.value, 10),
                  },
                })
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Minimum Similarity Threshold */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800 text-xs block">
                  Minimum Similarity Cutoff: {(localSettings.vectorSearchConfig.minSimilarity * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] text-slate-400">
                  Filters out chunks below this relevance score
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-600">
                {(localSettings.vectorSearchConfig.minSimilarity * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={localSettings.vectorSearchConfig.minSimilarity}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  vectorSearchConfig: {
                    ...localSettings.vectorSearchConfig,
                    minSimilarity: parseFloat(e.target.value),
                  },
                })
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Gemini Model Preference */}
          <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-slate-800 text-xs block">
                Model Preference
              </span>
              <span className="text-[11px] text-slate-400">
                Default LLM for grounded conversational RAG synthesis
              </span>
            </div>
            <select
              value={localSettings.modelPreference}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  modelPreference: e.target.value,
                })
              }
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            >
              <option value="gemini-flash">Gemini Flash (gemini-3.7-flash)</option>
              <option value="gemini-pro">Gemini Pro (gemini-3.1-pro-preview)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Chunking Configuration Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Deterministic Chunking Parameters</h3>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
            Configurable
          </span>
        </div>

        <div className="space-y-4 text-sm">
          {/* Target Chunk Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800 text-xs block">
                  Target Chunk Size: {localSettings.chunkingConfig.chunkSizeTokens} tokens (~{localSettings.chunkingConfig.chunkSizeTokens * 4} chars)
                </span>
                <span className="text-[11px] text-slate-400">
                  Recommended: 800–1200 tokens for balanced context density
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-600">
                {localSettings.chunkingConfig.chunkSizeTokens} tokens
              </span>
            </div>
            <input
              type="range"
              min="200"
              max="2000"
              step="50"
              value={localSettings.chunkingConfig.chunkSizeTokens}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  chunkingConfig: {
                    ...localSettings.chunkingConfig,
                    chunkSizeTokens: Number(e.target.value),
                  },
                })
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Chunk Overlap */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-800 text-xs block">
                  Chunk Overlap Window: {localSettings.chunkingConfig.chunkOverlapTokens} tokens (~{localSettings.chunkingConfig.chunkOverlapTokens * 4} chars)
                </span>
                <span className="text-[11px] text-slate-400">
                  Preserves boundary context across adjacent chunks
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-600">
                {localSettings.chunkingConfig.chunkOverlapTokens} tokens
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="400"
              step="10"
              value={localSettings.chunkingConfig.chunkOverlapTokens}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  chunkingConfig: {
                    ...localSettings.chunkingConfig,
                    chunkOverlapTokens: Number(e.target.value),
                  },
                })
              }
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* Respect Sentence Boundaries */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div>
              <span className="font-semibold text-slate-800 block text-xs">
                Respect Sentence & Word Boundaries
              </span>
              <span className="text-[11px] text-slate-400">
                Prevents splitting mid-word or breaking sentence clauses
              </span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.chunkingConfig.respectSentenceBoundaries}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  chunkingConfig: {
                    ...localSettings.chunkingConfig,
                    respectSentenceBoundaries: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          id="btn-save-settings"
          onClick={handleSave}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          Save Engine Settings
        </button>
      </div>
    </div>
  );
};
