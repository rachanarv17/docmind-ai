import React, { useState } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Copy,
  Check,
  FileText,
  RotateCcw,
  BookOpen,
  ArrowUpRight,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Cpu,
  Hash,
  Activity,
  Loader2,
} from 'lucide-react';
import { ChatMessage, DocumentItem, UserSettings, SearchResult, Citation } from '../types';
import { executeRAGQuery } from '../lib/vector/ragService';

interface ChatViewProps {
  documents: DocumentItem[];
  selectedDocFilter: string;
  onDocFilterChange: (docName: string) => void;
  settings: UserSettings;
  onOpenCitation: (filename: string, chunkId: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  documents,
  selectedDocFilter,
  onDocFilterChange,
  settings,
  onOpenCitation,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'assistant',
      content: `**DocMind AI Intelligence & RAG Retrieval Engine** (Phase 3 Active).\n\nDense vector embeddings, BM25 sparse indexing, and hybrid retrieval (α=${settings.vectorSearchConfig.hybridAlpha}) are active across all ingested document chunks. Ask any specific question, and responses will include verifiable chunk citations and confidence scores.`,
      timestamp: 'Just now',
      modelUsed: 'Hybrid RAG Vector Engine',
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedContextMsgId, setExpandedContextMsgId] = useState<string | null>(null);

  const samplePrompts = [
    'What revenue is reported in Q3 Financial Performance?',
    'What are the encryption standards in Enterprise Security Spec?',
    'List the active vendor contracts and annual values from the CSV',
    'What latency improvements are detailed in Transformer Spec?',
  ];

  const handleSend = async (textToSend?: string) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim() || isSearching) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsSearching(true);

    try {
      // Execute Real RAG query (vector search + context formulation + grounded synthesis)
      const ragResponse = await executeRAGQuery(prompt, documents, settings, selectedDocFilter);

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        content: ragResponse.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceDoc: ragResponse.sourceDoc,
        sourceChunks: ragResponse.sourceChunks,
        retrievedResults: ragResponse.retrievedResults,
        citations: ragResponse.citations,
        modelUsed: ragResponse.modelUsed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        content: `Error executing vector retrieval: ${err instanceof Error ? err.message : 'Unknown search failure'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceDoc: 'Error',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'msg-init',
        sender: 'assistant',
        content: `Conversation cleared. Vector embeddings and document indices remain active in memory.`,
        timestamp: 'Just now',
        modelUsed: 'Hybrid RAG Vector Engine',
      },
    ]);
  };

  return (
    <div id="chat-view" className="flex flex-col h-[calc(100vh-12rem)] min-h-[550px]">
      {/* Notice Banner */}
      <div className="bg-slate-900 text-slate-300 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>
            <strong>Phase 3 Vector Embeddings & RAG Retrieval:</strong> Hybrid cosine + BM25 ranking with verified provenance.
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            Top-K: {settings.vectorSearchConfig.topK}
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            α: {settings.vectorSearchConfig.hybridAlpha}
          </span>
        </div>
      </div>

      {/* Scope Controls */}
      <div className="bg-white p-3.5 border-x border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-semibold text-slate-600">Retrieval Scope:</span>
          <select
            id="chat-doc-context-select"
            value={selectedDocFilter}
            onChange={(e) => onDocFilterChange(e.target.value)}
            className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          >
            <option value="all">All Ingested Documents ({documents.length})</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.name}>
                {doc.name} ({doc.type} • {doc.chunkCount} chunks)
              </option>
            ))}
          </select>
        </div>

        <button
          id="chat-reset-btn"
          onClick={handleResetChat}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Clear Conversation
        </button>
      </div>

      {/* Message Stream */}
      <div className="flex-1 bg-slate-50 border-x border-slate-200 p-4 sm:p-6 overflow-y-auto space-y-5">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const isExpanded = expandedContextMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-4xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isUser ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-white'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-indigo-400" />}
              </div>

              <div className="space-y-2 flex-1">
                <div
                  className={`p-4 sm:p-5 rounded-2xl text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-xs shadow-xs'
                      : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs shadow-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-normal">{msg.content}</div>

                  {/* Verifiable Provenance Citations */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Grounded Citations ({msg.citations.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((cite) => (
                          <button
                            key={cite.citationId}
                            onClick={() => onOpenCitation(cite.filename, cite.chunkId)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50/70 hover:bg-indigo-100/90 border border-indigo-200/80 rounded-md text-[11px] text-indigo-900 transition-colors group text-left cursor-pointer"
                            title={`Click to inspect chunk: ${cite.snippet}`}
                          >
                            <span className="font-semibold">{cite.filename}</span>
                            {cite.pageNumber && (
                              <span className="text-indigo-600 bg-indigo-100/80 px-1 rounded text-[10px]">
                                p.{cite.pageNumber}
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-slate-500">
                              {(cite.similarityScore ? cite.similarityScore * 100 : 90).toFixed(0)}% match
                            </span>
                            <ExternalLink className="w-3 h-3 text-indigo-400 group-hover:text-indigo-700 ml-0.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vector Context Drawer Toggle */}
                  {!isUser && msg.retrievedResults && msg.retrievedResults.length > 0 && (
                    <div className="mt-3 pt-2">
                      <button
                        onClick={() => setExpandedContextMsgId(isExpanded ? null : msg.id)}
                        className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 py-1 font-medium transition-colors"
                      >
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {isExpanded ? 'Hide' : 'Inspect'} Retrieved Vector Context ({msg.retrievedResults.length} Chunks)
                        </span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {/* Expanded Vector Chunks & Scores */}
                      {isExpanded && (
                        <div className="mt-2.5 p-3 bg-slate-900 text-slate-100 rounded-xl text-xs space-y-3 font-mono">
                          <div className="text-[11px] text-slate-400 pb-1.5 border-b border-slate-800 flex items-center justify-between">
                            <span>Hybrid Ranking (Dense Cosine + Sparse BM25)</span>
                            <span>Model: {msg.modelUsed || 'Dense Embeddings'}</span>
                          </div>

                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {msg.retrievedResults.map((res) => (
                              <div
                                key={res.chunk.chunkId}
                                className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700/80 space-y-1.5"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-semibold text-indigo-300">
                                    #{res.rank} {res.chunk.filename} {res.chunk.pageNumber ? `(Page ${res.chunk.pageNumber})` : ''}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 text-[10px]">
                                    Score: {(res.similarityScore * 100).toFixed(1)}%
                                  </span>
                                </div>

                                <div className="text-[10px] text-slate-400 flex items-center gap-3">
                                  <span>Dense Cosine: {(res.denseScore * 100).toFixed(1)}%</span>
                                  <span>BM25 Sparse: {(res.sparseScore * 100).toFixed(1)}%</span>
                                  <span>Tokens: {res.chunk.tokenEstimate}</span>
                                </div>

                                <p className="text-[11px] text-slate-300 line-clamp-3 font-sans pt-1 border-t border-slate-700/50">
                                  {res.chunk.text}
                                </p>

                                <div className="pt-1 flex justify-end">
                                  <button
                                    onClick={() => onOpenCitation(res.chunk.filename, res.chunk.chunkId)}
                                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                                  >
                                    View Full Chunk in Inspector →
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Meta */}
                <div
                  className={`flex items-center gap-2 text-[10px] text-slate-400 px-1 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{msg.timestamp}</span>
                  {!isUser && msg.modelUsed && (
                    <>
                      <span>•</span>
                      <span className="font-mono text-[10px] text-slate-500">{msg.modelUsed}</span>
                    </>
                  )}
                  {!isUser && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="hover:text-slate-600 flex items-center gap-0.5 ml-1"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isSearching && (
          <div className="flex gap-3 max-w-xl mr-auto">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-2xl rounded-tl-xs shadow-xs text-xs text-slate-600 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <span>Executing hybrid vector search & synthesizing grounded answer...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Prompts & Input Area */}
      <div className="bg-white p-4 rounded-b-2xl border border-t-0 border-slate-200 space-y-3 shadow-xs">
        {/* Sample Prompt Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-semibold shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-600" /> Suggestions:
          </span>
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p)}
              disabled={isSearching}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs shrink-0 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span>{p}</span>
              <ArrowUpRight className="w-3 h-3 text-slate-400" />
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            id="chat-user-input"
            type="text"
            placeholder={`Ask a grounded question across ${
              selectedDocFilter === 'all' ? 'all ingested documents...' : selectedDocFilter
            }`}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={isSearching}
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-colors disabled:bg-slate-100"
          />
          <button
            id="chat-send-btn"
            type="submit"
            disabled={!inputPrompt.trim() || isSearching}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
