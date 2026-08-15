import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Trash2,
  Eye,
  FilePlus2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileCode,
  Table,
  HardDrive,
  FileWarning,
} from 'lucide-react';
import { DocumentItem, SupportedFileType, ChunkingConfig } from '../types';
import { processDocumentFile, IngestionProgressCallback } from '../lib/ingestion/pipeline';
import { DocumentDetailsModal } from './DocumentDetailsModal';

interface DocumentsViewProps {
  documents: DocumentItem[];
  onAddDocument: (doc: DocumentItem) => void;
  onDeleteDocument: (id: string) => void;
  searchQuery: string;
  chunkingConfig: ChunkingConfig;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  onAddDocument,
  onDeleteDocument,
  searchQuery,
  chunkingConfig,
}) => {
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('All');
  const [inspectingDoc, setInspectingDoc] = useState<DocumentItem | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [processingState, setProcessingState] = useState<{
    isProcessing: boolean;
    fileName: string;
    stepDescription: string;
    progressPercent: number;
    error?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const typeFilters: (SupportedFileType | 'All')[] = ['All', 'PDF', 'DOCX', 'TXT', 'MARKDOWN', 'CSV'];

  const filteredDocs = documents.filter((doc) => {
    const matchesType =
      selectedTypeFilter === 'All' || doc.type.toUpperCase() === selectedTypeFilter.toUpperCase();
    const matchesSearch =
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.rawSamplePreview && doc.rawSamplePreview.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      setProcessingState({
        isProcessing: true,
        fileName: file.name,
        stepDescription: 'Registering file for ingestion...',
        progressPercent: 10,
      });

      const onProgress: IngestionProgressCallback = (status, desc, pct) => {
        setProcessingState((prev) => ({
          isProcessing: status === 'PROCESSING' || status === 'UPLOADED',
          fileName: file.name,
          stepDescription: desc,
          progressPercent: pct,
          error: status === 'FAILED' ? desc : undefined,
        }));
      };

      try {
        const processedDoc = await processDocumentFile(
          {
            file,
            name: file.name,
            size: file.size,
            type: file.type,
          },
          chunkingConfig,
          onProgress,
          false // skipQdrant = false -> full embedding + Qdrant persistence
        );

        onAddDocument(processedDoc);

        if (processedDoc.status === 'FAILED') {
          setProcessingState({
            isProcessing: false,
            fileName: file.name,
            stepDescription: 'Processing failed',
            progressPercent: 100,
            error: processedDoc.errorMessage,
          });
        } else {
          // Brief success toast
          setTimeout(() => {
            setProcessingState(null);
          }, 1800);
        }
      } catch (err: any) {
        setProcessingState({
          isProcessing: false,
          fileName: file.name,
          stepDescription: 'Ingestion error',
          progressPercent: 100,
          error: err?.message || 'Failed to process document',
        });
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const getFormatIcon = (type: SupportedFileType) => {
    switch (type) {
      case 'PDF':
        return <FileText className="w-4 h-4 text-rose-600" />;
      case 'DOCX':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'MARKDOWN':
        return <FileCode className="w-4 h-4 text-purple-600" />;
      case 'CSV':
        return <Table className="w-4 h-4 text-emerald-600" />;
      case 'TXT':
      default:
        return <FileText className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div id="documents-view" className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Document Ingestion & Repository</h2>
            <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
              Phase 2: Ingestion Engine
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Real multi-format parser for PDF, DOCX, TXT, Markdown, and CSV with deterministic chunking.
          </p>
        </div>

        <button
          id="btn-upload-trigger"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-xs"
        >
          <FilePlus2 className="w-4 h-4" />
          Upload Document
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          accept=".pdf,.docx,.txt,.text,.md,.markdown,.csv"
        />
      </div>

      {/* Storage Architecture Notice */}
      <div className="p-3.5 bg-slate-900 text-slate-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            <strong>Persistent Vector DB (Phase 3B):</strong> Documents are embedded with{' '}
            <code>gemini-embedding-2</code> (768-dim) and persisted in <strong>Qdrant Vector Database</strong>.
            Embeddings and payloads survive server restarts.
          </span>
        </div>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-mono font-medium shrink-0 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Qdrant REST Connected
        </span>
      </div>

      {/* Upload Dropzone */}
      <div
        id="document-dropzone"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragActive
            ? 'border-indigo-600 bg-indigo-50/50 scale-[1.005]'
            : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/50 shadow-xs'
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-800">
              Click to upload or drag and drop files
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Supports <strong>PDF</strong>, <strong>DOCX</strong>, <strong>TXT</strong>, <strong>Markdown (.md)</strong>, and <strong>CSV</strong> (Max 50MB)
            </p>
          </div>
        </div>
      </div>

      {/* Active Processing / Progress Banner */}
      {processingState && (
        <div
          id="processing-status-card"
          className={`p-4 rounded-xl border text-xs shadow-xs transition-all ${
            processingState.error
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : processingState.progressPercent === 100
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-semibold">
              {processingState.error ? (
                <FileWarning className="w-4 h-4 text-rose-600" />
              ) : processingState.progressPercent === 100 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
              )}
              <span>Processing: {processingState.fileName}</span>
            </div>
            <span className="font-mono font-bold">{processingState.progressPercent}%</span>
          </div>

          <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden mb-2">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                processingState.error
                  ? 'bg-rose-600'
                  : processingState.progressPercent === 100
                  ? 'bg-emerald-600'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${processingState.progressPercent}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span>{processingState.error ? `Error: ${processingState.error}` : processingState.stepDescription}</span>
            {processingState.error && (
              <button
                onClick={() => setProcessingState(null)}
                className="underline hover:text-rose-900"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* Format Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-2">
          <Filter className="w-3.5 h-3.5" /> Format:
        </span>
        {typeFilters.map((fmt) => (
          <button
            key={fmt}
            onClick={() => setSelectedTypeFilter(fmt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedTypeFilter === fmt
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {fmt}
          </button>
        ))}
      </div>

      {/* Document Ingestion Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredDocs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No ingested documents found</p>
            <p className="text-xs text-slate-400">
              Upload a TXT, Markdown, CSV, DOCX, or PDF document to test the real parsing pipeline.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Document / Format</th>
                  <th className="py-3.5 px-4">File Size</th>
                  <th className="py-3.5 px-4">Pages / Sections</th>
                  <th className="py-3.5 px-4">Extracted Chars</th>
                  <th className="py-3.5 px-4">Chunks</th>
                  <th className="py-3.5 px-4">Ingestion Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    id={`doc-row-${doc.id}`}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    {/* Name & Format */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          {getFormatIcon(doc.type)}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800 block line-clamp-1">
                            {doc.name}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {doc.formattedDate} • {doc.type}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Size */}
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                      {doc.formattedSize}
                    </td>

                    {/* Pages / Sections */}
                    <td className="py-3.5 px-4 text-xs text-slate-700">
                      <span className="font-semibold">{doc.pageCount}</span>{' '}
                      <span className="text-slate-400">
                        {doc.type === 'PDF' ? 'pages' : 'sections'}
                      </span>
                    </td>

                    {/* Characters */}
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-700">
                      {doc.characterCount.toLocaleString()}
                    </td>

                    {/* Chunks */}
                    <td className="py-3.5 px-4 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/60">
                        <Layers className="w-3 h-3" />
                        {doc.chunkCount} chunks
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {doc.status === 'INDEXED' || doc.qdrantIndexed ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            INDEXED
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Qdrant (768-dim)
                          </div>
                        </div>
                      ) : doc.status === 'PROCESSED' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Chunked
                          </span>
                          <div className="text-[10px] text-slate-400 font-medium">
                            Ready for Indexing
                          </div>
                        </div>
                      ) : doc.status === 'PROCESSING' || doc.status === 'EMBEDDING' || doc.status === 'INDEXING' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3 animate-spin" />
                          {doc.status === 'EMBEDDING' ? 'Embedding...' : doc.status === 'INDEXING' ? 'Indexing...' : 'Processing...'}
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-3 h-3" />
                            FAILED
                          </span>
                          {doc.errorMessage && (
                            <div className="text-[10px] text-rose-500 max-w-[140px] truncate" title={doc.errorMessage}>
                              {doc.errorMessage}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-1">
                      <button
                        title="Inspect Extracted Text & Chunks"
                        onClick={() => setInspectingDoc(doc)}
                        className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors inline-block"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        title="Delete Document"
                        onClick={() => onDeleteDocument(doc.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors inline-block"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details / Chunk Inspector Modal */}
      {inspectingDoc && (
        <DocumentDetailsModal
          document={inspectingDoc}
          onClose={() => setInspectingDoc(null)}
        />
      )}
    </div>
  );
};
