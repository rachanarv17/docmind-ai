import fs from 'fs';
import path from 'path';
import { DocumentItem } from '../../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DOCUMENTS_FILE = path.join(DATA_DIR, 'documents.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadDocuments(): Record<string, DocumentItem> {
  ensureDataDir();
  if (!fs.existsSync(DOCUMENTS_FILE)) {
    fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify({}, null, 2), 'utf-8');
    return {};
  }
  try {
    const content = fs.readFileSync(DOCUMENTS_FILE, 'utf-8');
    return JSON.parse(content || '{}');
  } catch (err) {
    console.error('Error reading documents file:', err);
    return {};
  }
}

function saveDocuments(docs: Record<string, DocumentItem>): void {
  ensureDataDir();
  const tempFile = `${DOCUMENTS_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(docs, null, 2), 'utf-8');
  fs.renameSync(tempFile, DOCUMENTS_FILE);
}

export function getDocumentById(id: string): DocumentItem | null {
  const docs = loadDocuments();
  return docs[id] || null;
}

export function getDocumentsByUserId(userId: string): DocumentItem[] {
  const docs = loadDocuments();
  return Object.values(docs)
    .filter((d) => d.userId === userId)
    .sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
}

export function getAllDocuments(): DocumentItem[] {
  const docs = loadDocuments();
  return Object.values(docs).sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
}

export function saveDocument(userIdOrDoc: string | DocumentItem, maybeDoc?: DocumentItem): DocumentItem {
  const docs = loadDocuments();
  let doc: DocumentItem;
  let targetUserId: string | undefined;

  if (typeof userIdOrDoc === 'string') {
    targetUserId = userIdOrDoc;
    doc = maybeDoc!;
  } else {
    doc = userIdOrDoc;
    targetUserId = doc.userId;
  }

  const chunksWithUserId = (doc.chunks || []).map((c) => ({
    ...c,
    userId: targetUserId || doc.userId,
  }));

  const updatedDoc: DocumentItem = {
    ...doc,
    userId: targetUserId || doc.userId,
    chunks: chunksWithUserId,
  };

  docs[updatedDoc.id] = updatedDoc;
  saveDocuments(docs);
  return updatedDoc;
}

export function updateDocument(
  id: string,
  updates: Partial<DocumentItem>
): DocumentItem | null {
  const docs = loadDocuments();
  const existing = docs[id];
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    chunks: updates.chunks || existing.chunks,
  };

  docs[id] = updated;
  saveDocuments(docs);
  return updated;
}

export function deleteDocument(
  arg1: string,
  arg2?: string,
  isAdmin = false
): boolean {
  const docs = loadDocuments();
  if (arg2 !== undefined) {
    // Could be deleteDocument(docId, userId, isAdmin) OR deleteDocument(userId, docId)
    // Check if docs[arg1] exists (i.e. arg1 is docId)
    if (docs[arg1]) {
      const docId = arg1;
      const userId = arg2;
      const doc = docs[docId];
      if (!isAdmin && doc.userId && doc.userId !== userId) {
        return false;
      }
      delete docs[docId];
      saveDocuments(docs);
      return true;
    }
    // Otherwise arg1 is userId and arg2 is docId
    const userId = arg1;
    const docId = arg2;
    const doc = docs[docId];
    if (!doc || (!isAdmin && doc.userId && doc.userId !== userId)) {
      return false;
    }
    delete docs[docId];
    saveDocuments(docs);
    return true;
  } else {
    const docId = arg1;
    if (!docs[docId]) return false;
    delete docs[docId];
    saveDocuments(docs);
    return true;
  }
}

export function getDocumentStats(userId?: string): {
  totalDocs: number;
  totalChunks: number;
  indexedDocs: number;
  totalBytes: number;
} {
  let docs = Object.values(loadDocuments());
  if (userId) {
    docs = docs.filter((d) => d.userId === userId);
  }
  const totalChunks = docs.reduce((acc, d) => acc + (d.chunks?.length || 0), 0);
  const indexedDocs = docs.filter((d) => d.status === 'INDEXED' || d.qdrantIndexed).length;
  const totalBytes = docs.reduce((acc, d) => acc + (d.sizeBytes || d.size || 0), 0);
  return {
    totalDocs: docs.length,
    totalChunks,
    indexedDocs,
    totalBytes,
  };
}

export function clearAllDocuments(): void {
  saveDocuments({});
}

export const documentStore = {
  getDocumentById,
  getDocument: (userId: string, docId: string): DocumentItem | null => {
    const doc = getDocumentById(docId);
    if (!doc || doc.userId !== userId) return null;
    return doc;
  },
  getDocumentsByUserId,
  getUserDocuments: getDocumentsByUserId,
  getAllDocuments,
  saveDocument,
  updateDocument,
  deleteDocument,
  getDocumentStats,
  clearAllForTesting: clearAllDocuments,
};
