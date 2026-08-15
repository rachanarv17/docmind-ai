import React from 'react';
import {
  FileText,
  FileCheck2,
  Sparkles,
  Layers,
  Upload,
  ArrowRight,
  TrendingUp,
  HardDrive,
  Hash,
  Database,
} from 'lucide-react';
import { DocumentItem, NavTab } from '../types';

interface DashboardViewProps {
  documents: DocumentItem[];
  onNavigate: (tab: NavTab) => void;
  onInspectDoc: (doc: DocumentItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  documents,
  onNavigate,
  onInspectDoc,
}) => {
  const totalPages = documents.reduce((acc, doc) => acc + doc.pageCount, 0);
  const totalChars = documents.reduce((acc, doc) => acc + doc.characterCount, 0);
  const totalChunks = documents.reduce((acc, doc) => acc + doc.chunkCount, 0);
  const processedDocs = documents.filter((d) => d.status === 'PROCESSED').length;

  const formatCounts = {
    PDF: documents.filter((d) => d.type === 'PDF').length,
    DOCX: documents.filter((d) => d.type === 'DOCX').length,
    TXT: documents.filter((d) => d.type === 'TXT').length,
    MARKDOWN: documents.filter((d) => d.type === 'MARKDOWN').length,
    CSV: documents.filter((d) => d.type === 'CSV').length,
  };

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white shadow-md">
        <div className="max-w-3xl space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-semibold text-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            Phase 3B: Neural Embeddings + Persistent Qdrant Active
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            DocMind AI
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Production-grade Document Intelligence & RAG Platform. Real ingestion pipeline with multi-format parsing, 768-dimensional neural embeddings (<code>gemini-embedding-2</code>), persistent Qdrant vector storage, and grounded Gemini synthesis.
          </p>
          <div className="pt-3 flex flex-wrap gap-3">
            <button
              id="dashboard-goto-docs-btn"
              onClick={() => onNavigate('documents')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Ingest & Index Documents
            </button>
            <button
              id="dashboard-goto-chat-btn"
              onClick={() => onNavigate('chat')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium border border-white/20 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              AI Grounded RAG Chat
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          id="metric-total-docs"
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ingested Documents
            </span>
            <div className="text-2xl font-bold text-slate-900">{documents.length}</div>
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {processedDocs} Processed
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div
          id="metric-processed-pages"
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pages / Sections
            </span>
            <div className="text-2xl font-bold text-slate-900">{totalPages}</div>
            <span className="text-xs text-indigo-600 font-medium">
              Extracted & Normalized
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div
          id="metric-extracted-chars"
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Characters Extracted
            </span>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {totalChars.toLocaleString()}
            </div>
            <span className="text-xs text-emerald-600 font-medium">
              100% Real Text Ingested
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileCheck2 className="w-6 h-6" />
          </div>
        </div>

        <div
          id="metric-deterministic-chunks"
          className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between"
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Deterministic Chunks
            </span>
            <div className="text-2xl font-bold text-slate-900 font-mono">{totalChunks}</div>
            <span className="text-xs text-purple-600 font-medium">
              Token-bounded & Overlapped
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Hash className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Sections Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Ingested Documents */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Recent Ingested Documents
              </h3>
              <p className="text-xs text-slate-500">
                Parsed and chunked documents in runtime memory
              </p>
            </div>
            <button
              onClick={() => onNavigate('documents')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              View Repository <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {documents.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-lg transition-colors cursor-pointer"
                onClick={() => onInspectDoc(doc)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
                    {doc.type}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">
                      {doc.name}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>{doc.formattedSize}</span>
                      <span>•</span>
                      <span>{doc.pageCount} {doc.type === 'PDF' ? 'pages' : 'sections'}</span>
                      <span>•</span>
                      <span>{doc.characterCount.toLocaleString()} chars</span>
                      <span>•</span>
                      <span className="font-semibold text-indigo-600">{doc.chunkCount} chunks</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Processed
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ingestion Engine Status & Format Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600" />
              Ingestion Breakdown
            </h3>
            <span className="text-xs text-slate-400">By Format</span>
          </div>

          <div className="space-y-3">
            {[
              { label: 'PDF Documents (Page Metadata & Text)', count: formatCounts.PDF, color: 'bg-rose-500' },
              { label: 'DOCX Word Documents', count: formatCounts.DOCX, color: 'bg-blue-500' },
              { label: 'Markdown Files (.md)', count: formatCounts.MARKDOWN, color: 'bg-purple-500' },
              { label: 'CSV Tabular Datasets', count: formatCounts.CSV, color: 'bg-emerald-500' },
              { label: 'Plain Text Files (.txt)', count: formatCounts.TXT, color: 'bg-slate-500' },
            ].map((item, idx) => (
              <div key={idx} className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-700 font-medium">
                  <span>{item.label}</span>
                  <span className="font-bold">{item.count}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 ${item.color} rounded-full`}
                    style={{
                      width: `${documents.length > 0 ? (item.count / documents.length) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
              Phase 3 Roadmap Note:
            </div>
            <p className="text-[11px] leading-relaxed">
              Vector search, Qdrant/PGVector embeddings, and hybrid retrieval will be activated in Phase 3. All chunks are currently formatted with deterministic IDs and token boundaries.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
