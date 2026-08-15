import React, { useState, useEffect } from 'react';
import {
  FileText,
  Layers,
  Code2,
  Info,
  X,
  Copy,
  Check,
  AlertTriangle,
  FileCheck2,
  Calendar,
  HardDrive,
  Hash,
  BookOpen,
  ArrowRight,
  Cpu,
  Search,
  Zap,
} from 'lucide-react';
import { DocumentItem } from '../types';
import {
  generateDeterministicSemanticVector,
  cosineSimilarity,
  calculateBM25Score,
  calculateHybridScore,
  vectorNorm,
} from '../lib/vector/similarity';

interface DocumentDetailsModalProps {
  document: DocumentItem | null;
  targetChunkId?: string | null;
  onClose: () => void;
}

export const DocumentDetailsModal: React.FC<DocumentDetailsModalProps> = ({
  document,
  targetChunkId,
  onClose,
}) => {
  const [activeView, setActiveView] = useState<'text' | 'chunks' | 'vectors' | 'metadata'>(
    targetChunkId ? 'chunks' : 'text'
  );
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);
  const [copiedAllText, setCopiedAllText] = useState(false);

  // Vector tester state
  const [testQuery, setTestQuery] = useState('financial performance revenue');
  const [testAlpha, setTestAlpha] = useState(0.65);

  useEffect(() => {
    if (targetChunkId) {
      setActiveView('chunks');
      setTimeout(() => {
        const el = window.document.getElementById(`chunk-card-${targetChunkId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [targetChunkId]);

  if (!document) return null;

  const currentSection = document.sections[selectedSectionIdx] || document.sections[0];

  const handleCopyChunk = (chunkId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(chunkId);
    setTimeout(() => setCopiedChunkId(null), 1500);
  };

  const handleCopyAllText = () => {
    const fullText = document.sections
      .map((s) => `[${s.title || `Section ${s.sectionIndex + 1}`}]\n${s.text}`)
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(fullText);
    setCopiedAllText(true);
    setTimeout(() => setCopiedAllText(false), 1500);
  };

  // Compute live vector scores for the tester
  const queryVec = generateDeterministicSemanticVector(testQuery);
  const queryNorm = vectorNorm(queryVec);

  const scoredChunks = document.chunks
    .map((chunk) => {
      const cVec = generateDeterministicSemanticVector(chunk.text);
      const cNorm = vectorNorm(cVec);
      const dense = cosineSimilarity(queryVec, cVec, queryNorm, cNorm);
      const sparse = calculateBM25Score(testQuery, chunk.text);
      const hybrid = calculateHybridScore(dense, sparse, testAlpha);
      return {
        chunk,
        dense,
        sparse,
        hybrid,
      };
    })
    .sort((a, b) => b.hybrid - a.hybrid);

  return (
    <div
      id="doc-modal-overlay"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-fade-in"
    >
      <div
        id="doc-details-modal"
        className="bg-white rounded-2xl max-w-5xl w-full h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
              {document.type}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                  {document.name}
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    document.status === 'PROCESSED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : document.status === 'PROCESSING'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {document.status === 'PROCESSED' ? 'PROCESSED & VECTOR INDEXED' : document.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>{document.formattedSize}</span>
                <span>•</span>
                <span>{document.pageCount} {document.type === 'PDF' ? 'pages' : 'sections'}</span>
                <span>•</span>
                <span>{document.characterCount.toLocaleString()} chars</span>
                <span>•</span>
                <span>{document.chunkCount} chunks</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAllText}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {copiedAllText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              {copiedAllText ? 'Copied' : 'Copy All Extracted Text'}
            </button>
            <button
              id="btn-close-modal"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* OCR / Processing Warnings */}
        {document.ocrNotice && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 px-6 text-xs text-amber-800 flex items-start gap-2.5 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">OCR Notice: </span>
              <span>{document.ocrNotice}</span>
            </div>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 border-b border-slate-200 bg-white shrink-0 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveView('text')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeView === 'text'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Extracted Text ({document.sections.length} {document.type === 'PDF' ? 'Pages' : 'Sections'})
          </button>
          <button
            onClick={() => setActiveView('chunks')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeView === 'chunks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Chunk Inspector ({document.chunks.length} Chunks)
          </button>
          <button
            onClick={() => setActiveView('vectors')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeView === 'vectors'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-4 h-4 text-indigo-500" />
            Vector Semantic Tester (Phase 3)
          </button>
          <button
            onClick={() => setActiveView('metadata')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeView === 'metadata'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Info className="w-4 h-4" />
            Ingestion Metadata
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
          {/* TAB 1: Extracted Text Viewer */}
          {activeView === 'text' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full">
              <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1 overflow-y-auto max-h-[60vh] md:max-h-full">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                  {document.type === 'PDF' ? 'PDF Pages' : 'Document Sections'}
                </div>
                {document.sections.map((sec, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedSectionIdx(idx)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      selectedSectionIdx === idx
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{sec.title || `Section ${sec.sectionIndex + 1}`}</span>
                      {sec.pageNumber && (
                        <span className={`text-[10px] ${selectedSectionIdx === idx ? 'text-indigo-200' : 'text-slate-400'}`}>
                          p.{sec.pageNumber}
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${selectedSectionIdx === idx ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {sec.charCount} chars • {sec.wordCount} words
                    </div>
                  </button>
                ))}
              </div>

              <div className="md:col-span-3 bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between overflow-y-auto">
                {currentSection ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {currentSection.title || `Section ${currentSection.sectionIndex + 1}`}
                        </h4>
                        <span className="text-xs text-slate-500">
                          {currentSection.charCount} characters • {currentSection.wordCount} words
                          {currentSection.pageNumber ? ` • Page ${currentSection.pageNumber}` : ''}
                        </span>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-700 font-mono">
                        secIndex: {currentSection.sectionIndex}
                      </span>
                    </div>

                    <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/60 font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {currentSection.text}
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-400">No text sections available.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Chunk Viewer */}
          {activeView === 'chunks' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 flex items-start gap-3">
                <Layers className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Deterministic Chunks & Vector Provenance (Phase 3)</div>
                  <p className="text-indigo-800 leading-relaxed">
                    Each chunk carries deterministic lineage. Click on citations in the Chat to jump directly to any highlighted chunk.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {document.chunks.map((chunk) => {
                  const isTarget = targetChunkId === chunk.chunkId;
                  return (
                    <div
                      key={chunk.chunkId}
                      id={`chunk-card-${chunk.chunkId}`}
                      className={`rounded-xl p-4 space-y-2.5 transition-all ${
                        isTarget
                          ? 'bg-indigo-50/90 border-2 border-indigo-600 shadow-md ring-2 ring-indigo-200'
                          : 'bg-white border border-slate-200 hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {isTarget && (
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-600 text-white font-bold animate-pulse">
                              ★ Cited in Chat
                            </span>
                          )}
                          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                            {chunk.chunkId}
                          </span>
                          {chunk.pageNumber !== undefined && (
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold">
                              Page {chunk.pageNumber}
                            </span>
                          )}
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                            Section #{chunk.sectionIndex}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">
                            ~{chunk.tokenEstimate} Tokens ({chunk.charCount} Chars)
                          </span>
                        </div>

                        <button
                          onClick={() => handleCopyChunk(chunk.chunkId, chunk.text)}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 self-end sm:self-auto cursor-pointer"
                        >
                          {copiedChunkId === chunk.chunkId ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Chunk</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 font-sans text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {chunk.text}
                      </div>

                      <div className="text-[10px] text-slate-400 font-mono">
                        Span: chars {chunk.startChar} → {chunk.endChar}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Vector Semantic Tester */}
          {activeView === 'vectors' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" /> Real-time Vector Similarity Tester
                    </h4>
                    <p className="text-xs text-slate-500">
                      Test any custom query to inspect the Cosine Similarity and BM25 score across this document&apos;s chunks.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Hybrid α ({testAlpha}):</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={testAlpha}
                      onChange={(e) => setTestAlpha(parseFloat(e.target.value))}
                      className="w-24 accent-indigo-600 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    placeholder="Enter query to test vector similarity..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {scoredChunks.map((item, idx) => (
                  <div
                    key={item.chunk.chunkId}
                    className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-mono text-[11px] flex items-center justify-center font-bold">
                          #{idx + 1}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-800">
                          {item.chunk.chunkId}
                        </span>
                        {item.chunk.pageNumber && (
                          <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                            Page {item.chunk.pageNumber}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          Hybrid: {(item.hybrid * 100).toFixed(1)}%
                        </span>
                        <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          Cosine: {(item.dense * 100).toFixed(1)}%
                        </span>
                        <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          BM25: {(item.sparse * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 font-sans whitespace-pre-wrap line-clamp-3">
                      {item.chunk.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Ingestion Metadata */}
          {activeView === 'metadata' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-600" /> Ingestion Record Metadata
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Document ID</span>
                    <span className="font-mono font-bold text-slate-800 break-all">{document.id}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Original Filename</span>
                    <span className="font-semibold text-slate-800">{document.name}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">MIME Format</span>
                    <span className="font-mono text-slate-800">{document.mimeType}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Payload Size</span>
                    <span className="font-semibold text-slate-800">{document.formattedSize} ({document.sizeBytes.toLocaleString()} bytes)</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Total Extracted Characters</span>
                    <span className="font-semibold text-slate-800">{document.characterCount.toLocaleString()} chars</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Total Words Extracted</span>
                    <span className="font-semibold text-slate-800">{document.wordCount.toLocaleString()} words</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Pages / Structural Sections</span>
                    <span className="font-semibold text-slate-800">{document.pageCount} pages / {document.sectionCount} sections</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Total Deterministic Chunks</span>
                    <span className="font-semibold text-indigo-600">{document.chunkCount} chunks</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-slate-400 block mb-1">Ingestion Timestamp</span>
                    <span className="font-semibold text-slate-800">{document.formattedDate}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
