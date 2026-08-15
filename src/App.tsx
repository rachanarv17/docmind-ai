import React, { useState, useEffect, useCallback } from 'react';
import { NavTab, DocumentItem, UserSettings } from './types';
import { AuthProvider, useAuth } from './lib/auth/AuthContext';
import { AuthView } from './components/AuthView';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { DocumentsView } from './components/DocumentsView';
import { ChatView } from './components/ChatView';
import { SettingsView } from './components/SettingsView';
import { AdminView } from './components/AdminView';
import { DocumentDetailsModal } from './components/DocumentDetailsModal';
import { generateInitialRealDocuments } from './lib/ingestion/seedDocuments';
import { DEFAULT_CHUNKING_CONFIG } from './lib/ingestion/chunker';
import { DEFAULT_VECTOR_SEARCH_CONFIG } from './lib/vector/vectorStore';
import { globalQdrantStore } from './lib/vector/qdrantStore';
import { authFetch } from './lib/auth/authClient';

const INITIAL_SETTINGS: UserSettings = {
  modelPreference: 'gemini-flash',
  autoSummarize: true,
  theme: 'light',
  extractKeywords: true,
  confidenceThreshold: 85,
  chunkingConfig: DEFAULT_CHUNKING_CONFIG,
  vectorSearchConfig: DEFAULT_VECTOR_SEARCH_CONFIG,
};

function MainApplication() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDocForChat, setSelectedDocForChat] = useState<string>('all');
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [inspectingDoc, setInspectingDoc] = useState<DocumentItem | null>(null);
  const [targetChunkId, setTargetChunkId] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);

  // Load user's documents from server
  const loadUserDocuments = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingDocs(true);
    try {
      // Ensure Qdrant collection is ready
      await globalQdrantStore.initCollection();

      const res = await authFetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        let userDocs: DocumentItem[] = data.documents || [];

        // If this is a fresh user with no documents yet, seed initial documents for their workspace
        if (userDocs.length === 0) {
          const seeded = await generateInitialRealDocuments();
          const uploadedDocs: DocumentItem[] = [];

          for (const doc of seeded) {
            try {
              // 1. Upload metadata to server
              const uploadRes = await authFetch('/api/documents/upload', {
                method: 'POST',
                body: JSON.stringify(doc),
              });
              if (uploadRes.ok) {
                const uploadData = await uploadRes.json();
                const serverDoc = uploadData.document || doc;

                // 2. Index in Qdrant with user isolation
                await globalQdrantStore.indexDocument(serverDoc);
                uploadedDocs.push({
                  ...serverDoc,
                  status: 'INDEXED',
                  embeddingModel: 'gemini-embedding-2',
                  vectorDatabase: 'Qdrant (Persistent)',
                  vectorCount: serverDoc.chunks.length,
                  qdrantIndexed: true,
                });
              }
            } catch (seedErr) {
              console.warn('Error seeding user document:', seedErr);
            }
          }
          userDocs = uploadedDocs.length > 0 ? uploadedDocs : seeded;
        }

        setDocuments(userDocs);
      }
    } catch (err) {
      console.error('Failed to load user documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadUserDocuments();
    }
  }, [isAuthenticated, loadUserDocuments]);

  const handleAddDocument = async (newDoc: DocumentItem) => {
    try {
      // Save to server
      const res = await authFetch('/api/documents/upload', {
        method: 'POST',
        body: JSON.stringify(newDoc),
      });
      if (res.ok) {
        const data = await res.json();
        const serverDoc = data.document || newDoc;
        setDocuments((prev) => [serverDoc, ...prev.filter((d) => d.id !== serverDoc.id)]);
      } else {
        setDocuments((prev) => [newDoc, ...prev]);
      }
    } catch (err) {
      console.error('Failed to sync document with server:', err);
      setDocuments((prev) => [newDoc, ...prev]);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    try {
      await authFetch(`/api/documents/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete document from server:', err);
    }
  };

  const handleOpenCitation = (filename: string, chunkId: string) => {
    const targetDoc = documents.find((d) => d.name === filename);
    if (targetDoc) {
      setTargetChunkId(chunkId);
      setInspectingDoc(targetDoc);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-400 font-medium">Authenticating DocMind Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView />;
  }

  return (
    <div
      id="docmind-app"
      className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 antialiased selection:bg-indigo-500 selection:text-white"
    >
      {/* Global Header */}
      <Header
        activeTab={activeTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Container Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          documentCount={documents.length}
        />

        {/* Dynamic Content View */}
        <main
          id="main-content-area"
          className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto overflow-y-auto"
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              documents={documents}
              onNavigate={setActiveTab}
              onInspectDoc={setInspectingDoc}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsView
              documents={documents}
              onAddDocument={handleAddDocument}
              onDeleteDocument={handleDeleteDocument}
              searchQuery={searchQuery}
              chunkingConfig={settings.chunkingConfig}
            />
          )}

          {activeTab === 'chat' && (
            <ChatView
              documents={documents}
              selectedDocFilter={selectedDocForChat}
              onDocFilterChange={setSelectedDocForChat}
              settings={settings}
              onOpenCitation={handleOpenCitation}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'admin' && <AdminView />}
        </main>
      </div>

      {/* Global Document & Chunk Inspector Modal */}
      {inspectingDoc && (
        <DocumentDetailsModal
          document={inspectingDoc}
          targetChunkId={targetChunkId}
          onClose={() => {
            setInspectingDoc(null);
            setTargetChunkId(null);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApplication />
    </AuthProvider>
  );
}
