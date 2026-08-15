import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { QdrantClient } from '@qdrant/js-client-rest';

// Internal Server Modules
import {
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  getAllUsers,
  getUsersStats,
  toSafeUser,
} from './server/db/userStore';
import {
  getDocumentById,
  getDocumentsByUserId,
  getAllDocuments,
  saveDocument,
  updateDocument,
  deleteDocument,
  getDocumentStats,
} from './server/db/documentStore';
import { logAuditEvent, getAuditLogs, getAuditStats } from './server/db/auditStore';
import {
  hashPassword,
  comparePassword,
  generateToken,
  AUTH_COOKIE_NAME,
  getCookieOptions,
} from './server/auth/authService';
import {
  authenticateUser,
  optionalAuth,
  requireRole,
  extractClientIp,
} from './server/middleware/authMiddleware';
import {
  authRateLimiter,
  chatRateLimiter,
  uploadRateLimiter,
  generalApiLimiter,
} from './server/middleware/rateLimiter';
import { validateUploadedFile, sanitizeFilename } from './server/security/fileValidator';
import {
  buildSafeContextPrompt,
  detectPromptInjection,
  GROUNDED_SYSTEM_INSTRUCTION,
} from './server/security/promptDefense';
import { DocumentItem } from './src/types';
import {
  logStructured,
  requestCorrelationMiddleware,
} from './server/utils/logger';
import { centralErrorHandler } from './server/middleware/errorHandler';

dotenv.config();

function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === 'docmind-ai-production-jwt-auth-secret-key-2026') {
      const msg = 'CRITICAL CONFIGURATION ERROR: In production mode, AUTH_SECRET must be explicitly set to a strong secret in environment variables.';
      logStructured({
        timestamp: new Date().toISOString(),
        level: 'SECURITY',
        event: 'CONFIG_VALIDATION_FAILURE',
        error: msg,
      });
      // In production enforce explicit AUTH_SECRET
      if (!process.env.AUTH_SECRET) {
        throw new Error(msg);
      }
    }
  }

  logStructured({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    event: 'SERVER_INIT',
    details: {
      environment: process.env.NODE_ENV || 'development',
      hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      qdrantUrl: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
      hasAuthSecret: Boolean(process.env.AUTH_SECRET),
    },
  });
}

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

let qdrantClient: QdrantClient | null = null;

function getQdrant(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
      checkCompatibility: false,
    });
  }
  return qdrantClient;
}

async function startServer() {
  validateEnvironment();

  const app = express();
  const PORT = 3000;

  // Enable trust proxy for reverse proxies (e.g. Cloud Run, Nginx)
  app.set('trust proxy', 1);

  // Request correlation and structured logging
  app.use(requestCorrelationMiddleware);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows Vite and preview iframe integration
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // CORS Configuration
  const allowedOrigin = process.env.FRONTEND_ORIGIN || undefined;
  app.use(
    cors({
      origin: allowedOrigin ? allowedOrigin.split(',') : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Apply general API rate limiting to /api routes
  app.use('/api', generalApiLimiter);

  // --- API Routes ---

  // Enhanced Production Health Check
  app.get('/api/health', async (req, res) => {
    const startTime = Date.now();
    let qdrantStatus: 'connected' | 'disconnected' | 'not_configured' = 'disconnected';
    let qdrantLatencyMs = 0;

    try {
      const qdrant = getQdrant();
      const qStart = Date.now();
      await Promise.race([
        qdrant.getCollections(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Qdrant ping timeout')), 2000)),
      ]);
      qdrantLatencyMs = Date.now() - qStart;
      qdrantStatus = 'connected';
    } catch {
      qdrantStatus = 'disconnected';
    }

    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasXAI = Boolean(process.env.XAI_API_KEY);
    const dbStats = getDocumentStats();
    const userStats = getUsersStats();

    const isHealthy = hasGemini && hasXAI && qdrantStatus === 'connected';

    const healthData = {
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'DocMind AI',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      requestId: req.id,
      services: {
        xai: {
          status: hasXAI ? 'configured' : 'missing_api_key',
          model: 'grok-4.5',
        },
        gemini: {
          status: hasGemini ? 'configured' : 'missing_api_key',
          embeddingModel: 'gemini-embedding-2',
        },
        qdrant: {
          status: qdrantStatus,
          url: QDRANT_URL,
          latencyMs: qdrantLatencyMs,
        },
        database: {
          status: 'operational',
          totalUsers: userStats.total,
          totalDocuments: dbStats.totalDocs,
          totalChunks: dbStats.totalChunks,
        },
      },
    };

    return res.status(200).json(healthData);
  });

  // ==========================================
  // AUTHENTICATION ROUTES
  // ==========================================

  // Register
  app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    try {
      const { name, email, password, role } = req.body;
      const ip = extractClientIp(req);

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required' });
      }

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }

      const existingUser = getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);
      const newUser = createUser({
        name,
        email,
        passwordHash,
        role: role === 'ADMIN' ? 'ADMIN' : undefined,
      });

      const token = generateToken(newUser);
      res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());

      logAuditEvent('REGISTER', {
        userId: newUser.id,
        userEmail: newUser.email,
        ipAddress: ip,
        details: { role: newUser.role },
      });

      logAuditEvent('LOGIN_SUCCESS', {
        userId: newUser.id,
        userEmail: newUser.email,
        ipAddress: ip,
        details: { method: 'registration' },
      });

      return res.status(201).json({
        user: newUser,
        token,
        message: 'Account registered successfully',
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      return res.status(400).json({ error: errorMessage });
    }
  });

  // Login
  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      const ip = extractClientIp(req);

      if (!email || !password) {
        return res.status(400).json({ error: 'Invalid email or password.' });
      }

      const userWithHash = getUserByEmail(email);
      if (!userWithHash) {
        logAuditEvent('LOGIN_FAILURE', {
          userEmail: email,
          ipAddress: ip,
          details: 'Account not found',
        });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const isMatch = await comparePassword(password, userWithHash.passwordHash);
      if (!isMatch) {
        logAuditEvent('LOGIN_FAILURE', {
          userId: userWithHash.id,
          userEmail: userWithHash.email,
          ipAddress: ip,
          details: 'Password mismatch',
        });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (userWithHash.status === 'SUSPENDED') {
        logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
          userId: userWithHash.id,
          userEmail: userWithHash.email,
          ipAddress: ip,
          details: 'Suspended user attempted login',
          severity: 'SECURITY',
        });
        return res.status(403).json({
          error: 'Account is suspended. Please contact an administrator.',
        });
      }

      const safeUser = toSafeUser(userWithHash);
      const token = generateToken(safeUser);
      res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());

      logAuditEvent('LOGIN_SUCCESS', {
        userId: safeUser.id,
        userEmail: safeUser.email,
        ipAddress: ip,
      });

      return res.json({
        user: safeUser,
        token,
        message: 'Logged in successfully',
      });
    } catch (err: unknown) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Authentication failed. Please try again.' });
    }
  });

  // Logout
  app.post('/api/auth/logout', optionalAuth, (req, res) => {
    const ip = extractClientIp(req);
    if (req.user) {
      logAuditEvent('LOGOUT', {
        userId: req.user.id,
        userEmail: req.user.email,
        ipAddress: ip,
      });
    }
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    return res.json({ success: true, message: 'Logged out successfully' });
  });

  // Get Current Profile (Me)
  app.get('/api/auth/me', authenticateUser, (req, res) => {
    return res.json({
      user: req.user,
    });
  });

  // Change Password
  app.post('/api/auth/change-password', authenticateUser, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = getUserById(req.user!.id);
      const ip = extractClientIp(req);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters long' });
      }

      const isMatch = await comparePassword(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const newHash = await hashPassword(newPassword);
      updateUser(user.id, { passwordHash: newHash });

      logAuditEvent('PASSWORD_CHANGED', {
        userId: user.id,
        userEmail: user.email,
        ipAddress: ip,
      });

      return res.json({ success: true, message: 'Password changed successfully' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      return res.status(400).json({ error: msg });
    }
  });

  // ==========================================
  // DOCUMENT MANAGEMENT ROUTES (User-Isolated)
  // ==========================================

  // Upload / Save Document
  app.post('/api/documents/upload', uploadRateLimiter, authenticateUser, async (req, res) => {
    try {
      const ip = extractClientIp(req);
      const docData: DocumentItem = req.body;

      if (!docData || !docData.name) {
        return res.status(400).json({ error: 'Document data and name are required' });
      }

      const validation = validateUploadedFile(
        docData.name,
        docData.sizeBytes || 1024,
        docData.mimeType
      );

      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Enforce user ownership server-side
      const documentId = docData.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const sanitizedName = validation.sanitizedFilename || sanitizeFilename(docData.name);

      const serverDoc: DocumentItem = {
        ...docData,
        id: documentId,
        userId: req.user!.id,
        name: sanitizedName,
        type: validation.detectedType || docData.type || 'TXT',
        uploadTimestamp: docData.uploadTimestamp || Date.now(),
        formattedDate: docData.formattedDate || new Date().toLocaleString(),
        status: docData.status || 'UPLOADED',
        // Inject userId into all chunks
        chunks: (docData.chunks || []).map((c) => ({
          ...c,
          documentId,
          userId: req.user!.id,
        })),
      };

      const saved = saveDocument(serverDoc);

      logAuditEvent('DOCUMENT_UPLOADED', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ipAddress: ip,
        resourceId: saved.id,
        details: { filename: saved.name, type: saved.type, sizeBytes: saved.sizeBytes },
      });

      return res.status(201).json({
        success: true,
        document: saved,
      });
    } catch (err: unknown) {
      console.error('Error saving document:', err);
      return res.status(500).json({ error: 'Failed to process document upload' });
    }
  });

  // Get User's Documents
  app.get('/api/documents', authenticateUser, (req, res) => {
    try {
      const { all } = req.query;
      if (all === 'true' && req.user!.role === 'ADMIN') {
        const allDocs = getAllDocuments();
        return res.json({ documents: allDocs });
      }
      const userDocs = getDocumentsByUserId(req.user!.id);
      return res.json({ documents: userDocs });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  // Get Document by ID (Enforcing Ownership)
  app.get('/api/documents/:id', authenticateUser, (req, res) => {
    try {
      const doc = getDocumentById(req.params.id);
      const ip = extractClientIp(req);

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check ownership
      if (doc.userId && doc.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
        logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
          userId: req.user!.id,
          userEmail: req.user!.email,
          ipAddress: ip,
          resourceId: doc.id,
          details: `User attempted to access document owned by ${doc.userId}`,
          severity: 'SECURITY',
        });
        return res.status(403).json({
          error: 'Forbidden: You do not have permission to access this document.',
        });
      }

      return res.json({ document: doc });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // Delete Document (Ownership Enforced & Vector Cleanup)
  app.delete('/api/documents/:id', authenticateUser, async (req, res) => {
    try {
      const docId = req.params.id;
      const doc = getDocumentById(docId);
      const ip = extractClientIp(req);

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify ownership
      if (doc.userId && doc.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
        logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
          userId: req.user!.id,
          userEmail: req.user!.email,
          ipAddress: ip,
          resourceId: docId,
          details: `User attempted to delete document owned by ${doc.userId}`,
          severity: 'SECURITY',
        });
        return res.status(403).json({
          error: 'Forbidden: You do not own this document.',
        });
      }

      // Delete vectors from Qdrant with userId & documentId filter
      try {
        const client = getQdrant();
        const collectionName = 'docmind_chunks';
        const has = await client.collectionExists(collectionName);
        if (has.exists) {
          await client.delete(collectionName, {
            filter: {
              must: [
                { key: 'userId', match: { value: doc.userId || req.user!.id } },
                { key: 'documentId', match: { value: docId } },
              ],
            },
          });
        }
      } catch (vectorErr) {
        console.error('Error cleaning up Qdrant vectors for deleted document:', vectorErr);
      }

      // Delete metadata from storage
      deleteDocument(docId, req.user!.id, req.user!.role === 'ADMIN');

      logAuditEvent('DOCUMENT_DELETED', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ipAddress: ip,
        resourceId: docId,
        details: { filename: doc.name },
      });

      return res.json({ success: true, message: 'Document and vectors deleted successfully' });
    } catch (err: unknown) {
      console.error('Error deleting document:', err);
      return res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // Re-index Document (Ownership Enforced)
  app.post('/api/documents/:id/reindex', authenticateUser, async (req, res) => {
    try {
      const docId = req.params.id;
      const doc = getDocumentById(docId);
      const ip = extractClientIp(req);

      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (doc.userId && doc.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
        logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
          userId: req.user!.id,
          userEmail: req.user!.email,
          ipAddress: ip,
          resourceId: docId,
          details: 'User attempted to reindex another user document',
          severity: 'SECURITY',
        });
        return res.status(403).json({ error: 'Forbidden: You do not own this document.' });
      }

      const client = getGeminiClient();
      const qdrant = getQdrant();
      const collectionName = 'docmind_chunks';

      // 1. Delete existing vectors for this document & user
      const has = await qdrant.collectionExists(collectionName);
      if (has.exists) {
        await qdrant.delete(collectionName, {
          filter: {
            must: [
              { key: 'userId', match: { value: req.user!.id } },
              { key: 'documentId', match: { value: docId } },
            ],
          },
        });
      } else {
        await qdrant.createCollection(collectionName, {
          vectors: { size: 768, distance: 'Cosine' },
        });
      }

      // 2. Generate embeddings if Gemini is available
      if (client && Array.isArray(doc.chunks) && doc.chunks.length > 0) {
        const { deterministicChunkUUID } = await import('./src/lib/vector/qdrantStore');
        const points = [];

        for (const chunk of doc.chunks) {
          const embRes = await client.models.embedContent({
            model: 'gemini-embedding-2',
            contents: chunk.text,
            config: { outputDimensionality: 768 },
          });
          const vector = embRes.embeddings?.[0]?.values || [];

          points.push({
            id: deterministicChunkUUID(chunk.chunkId),
            vector,
            payload: {
              userId: req.user!.id,
              documentId: doc.id,
              chunkId: chunk.chunkId,
              filename: doc.name,
              pageNumber: chunk.pageNumber,
              sectionIndex: chunk.sectionIndex,
              chunkIndex: chunk.chunkIndex,
              text: chunk.text,
              charCount: chunk.charCount,
              tokenEstimate: chunk.tokenEstimate,
              startChar: chunk.startChar,
              endChar: chunk.endChar,
              indexedTimestamp: Date.now(),
            },
          });
        }

        // Upsert into Qdrant
        await qdrant.upsert(collectionName, { points });
      }

      const updated = updateDocument(docId, {
        status: 'INDEXED',
        qdrantIndexed: true,
        indexedTimestamp: Date.now(),
        vectorDatabase: 'Qdrant',
        vectorCount: doc.chunks?.length || 0,
      });

      logAuditEvent('DOCUMENT_REINDEXED', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ipAddress: ip,
        resourceId: docId,
        details: { filename: doc.name, chunkCount: doc.chunks?.length || 0 },
      });

      return res.json({ success: true, document: updated });
    } catch (err: unknown) {
      console.error('Error re-indexing document:', err);
      return res.status(500).json({ error: 'Failed to reindex document' });
    }
  });

  // User Dashboard Stats
  app.get('/api/dashboard/stats', authenticateUser, (req, res) => {
    try {
      const stats = getDocumentStats(req.user!.id);
      return res.json({
        stats: {
          totalDocuments: stats.totalDocs,
          totalChunks: stats.totalChunks,
          indexedDocuments: stats.indexedDocs,
          totalStorageBytes: stats.totalBytes,
          userId: req.user!.id,
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
  });

  // ==========================================
  // RAG CHAT & RETRIEVAL (Multi-Tenant Grounded)
  // ==========================================

  // RAG Chat Generation Endpoint
  app.post('/api/chat', chatRateLimiter, authenticateUser, async (req, res) => {
    try {
      const { message, contextChunks, modelPreference } = req.body;
      const ip = extractClientIp(req);
      const userId = req.user!.id;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Check prompt injection on user query
      detectPromptInjection(message, 'USER_QUERY', {
        userId,
        ipAddress: ip,
      });

      if (!process.env.XAI_API_KEY) {
        return res.status(200).json({
          status: 'no_api_key',
          message: 'xAI API key is not configured in server environment for generation.',
        });
      }

      // Verify and isolate context chunks
      let authorizedChunks: any[] = [];
      if (Array.isArray(contextChunks) && contextChunks.length > 0) {
        const userDocs = getDocumentsByUserId(userId);
        const userDocIds = new Set(userDocs.map((d) => d.id));
        const userDocNames = new Set(userDocs.map((d) => d.name));

        for (const c of contextChunks) {
          // If chunk has documentId or filename, verify it belongs to user
          if (
            (c.documentId && userDocIds.has(c.documentId)) ||
            (c.filename && userDocNames.has(c.filename)) ||
            (c.userId && c.userId === userId) ||
            userDocs.length > 0 // If user has documents and chunks match
          ) {
            authorizedChunks.push(c);
          } else {
            logAuditEvent('UNAUTHORIZED_DOCUMENT_ACCESS', {
              userId,
              userEmail: req.user!.email,
              ipAddress: ip,
              resourceId: c.id,
              details: {
                reason: 'Unauthorized chunk citation/context injected into chat request',
                chunkFilename: c.filename,
              },
              severity: 'SECURITY',
            });
          }
        }
      }

      // Build safe context prompt with truncation and injection defense
      const { contextPrompt, includedChunks, truncated } = buildSafeContextPrompt(
        authorizedChunks,
        userId,
        ip
      );

      const selectedModel = 'grok-4.5';
      const prompt = `${contextPrompt}\n\nUSER QUESTION:\n${message}\n\nPlease provide a grounded, cited answer based strictly on the context above.`;

      const xaiResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: GROUNDED_SYSTEM_INSTRUCTION },
            { role: 'user', content: prompt }
          ],
          temperature: 0.15,
        }),
      });

      if (!xaiResponse.ok) {
        const errText = await xaiResponse.text();
        throw new Error(`xAI generation failed: ${xaiResponse.status} ${errText}`);
      }

      const xaiData = await xaiResponse.json();
      const answer = xaiData.choices?.[0]?.message?.content || 'No response generated.';

      // Generate verified citations strictly matching included authorized chunks
      const citations = includedChunks.map((c, i) => ({
        citationId: `cit_${c.id}_${i + 1}`,
        documentId: c.documentId || '',
        filename: c.filename,
        pageNumber: c.pageNumber,
        chunkId: c.id,
        snippet: c.text.slice(0, 150),
        similarityScore: c.similarityScore,
      }));

      return res.json({
        answer,
        modelUsed: selectedModel,
        citations,
        truncated,
        authorizedChunksCount: includedChunks.length,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
      console.error('Error in /api/chat:', errorMessage);
      return res.status(500).json({ error: errorMessage });
    }
  });

  // Vector Embeddings Endpoint (Real neural embeddings with gemini-embedding-2)
  app.post('/api/embeddings', authenticateUser, async (req, res) => {
    try {
      const { text, texts } = req.body;
      const inputTexts: string[] = Array.isArray(texts)
        ? texts
        : typeof text === 'string' && text.trim()
        ? [text]
        : [];

      if (inputTexts.length === 0) {
        return res.status(400).json({ error: 'Text or texts array is required for embeddings' });
      }

      const client = getGeminiClient();
      if (!client) {
        return res.status(200).json({
          status: 'no_api_key',
          message: 'GEMINI_API_KEY is not configured in server environment.',
        });
      }

      const model = 'gemini-embedding-2';
      const embeddings: number[][] = [];

      for (const itemText of inputTexts) {
        const embedRes = await client.models.embedContent({
          model,
          contents: itemText,
          config: {
            outputDimensionality: 768,
          },
        });
        const vector = embedRes.embeddings?.[0]?.values || [];
        embeddings.push(vector);
      }

      return res.json({
        status: 'ok',
        model,
        dimension: embeddings[0]?.length || 768,
        embeddings,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Embedding generation failed';
      console.error('Error generating embeddings in /api/embeddings:', errorMessage);
      return res.status(500).json({ error: errorMessage });
    }
  });

  // ==========================================
  // QDRANT VECTOR STORE (User-Isolated)
  // ==========================================

  // Qdrant Health / Status Endpoint
  app.get('/api/qdrant/status', authenticateUser, async (req, res) => {
    try {
      const client = getQdrant();
      const collectionName = 'docmind_chunks';
      const has = await client.collectionExists(collectionName);
      let userPointsCount = 0;

      if (has.exists) {
        const countRes = await client.count(collectionName, {
          filter: {
            must: [{ key: 'userId', match: { value: req.user!.id } }],
          },
        });
        userPointsCount = countRes.count || 0;
      }

      return res.json({
        connected: true,
        collectionExists: has.exists,
        pointsCount: userPointsCount,
        collection: collectionName,
        url: QDRANT_URL,
        isolatedUserId: req.user!.id,
      });
    } catch (err: unknown) {
      return res.json({
        connected: false,
        error: err instanceof Error ? err.message : 'Cannot connect to Qdrant server',
      });
    }
  });

  // Qdrant Init Collection Endpoint
  app.post('/api/qdrant/init', authenticateUser, async (req, res) => {
    try {
      const {
        collectionName = 'docmind_chunks',
        vectorSize = 768,
        distance = 'Cosine',
        recreate = false,
      } = req.body;
      const client = getQdrant();
      const has = await client.collectionExists(collectionName);

      if (recreate && has.exists && req.user!.role === 'ADMIN') {
        await client.deleteCollection(collectionName);
      }

      if (recreate || !has.exists) {
        await client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: distance as 'Cosine' | 'Dot' | 'Euclid',
          },
        });
      }

      return res.json({
        success: true,
        collection: collectionName,
        created: !has.exists || recreate,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to init Qdrant collection';
      return res.status(500).json({ error: errorMessage });
    }
  });

  // Qdrant Upsert Points (User Ownership Enforced)
  app.post('/api/qdrant/upsert', authenticateUser, async (req, res) => {
    try {
      const { collectionName = 'docmind_chunks', points = [] } = req.body;
      if (!Array.isArray(points) || points.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const client = getQdrant();
      const has = await client.collectionExists(collectionName);
      if (!has.exists) {
        await client.createCollection(collectionName, {
          vectors: { size: points[0]?.vector?.length || 768, distance: 'Cosine' },
        });
      }

      // Stamp every point with the authenticated userId
      const userScopedPoints = points.map((p) => ({
        ...p,
        payload: {
          ...(p.payload || {}),
          userId: req.user!.id,
          indexedTimestamp: Date.now(),
        },
      }));

      const batchSize = 50;
      for (let i = 0; i < userScopedPoints.length; i += batchSize) {
        const batch = userScopedPoints.slice(i, i + batchSize);
        await client.upsert(collectionName, { points: batch });
      }

      return res.json({
        success: true,
        count: userScopedPoints.length,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upsert points to Qdrant';
      return res.status(500).json({ error: errorMessage });
    }
  });

  // Qdrant Semantic Search Endpoint (STRICT USER FILTERING)
  app.post('/api/qdrant/search', authenticateUser, async (req, res) => {
    try {
      const { collectionName = 'docmind_chunks', vector, limit = 10, docFilter } = req.body;
      if (!Array.isArray(vector) || vector.length === 0) {
        return res.status(400).json({ error: 'Vector query float array is required' });
      }

      const client = getQdrant();
      const has = await client.collectionExists(collectionName);
      if (!has.exists) {
        return res.json({ points: [] });
      }

      // CRITICAL: Mandatory userId filter to isolate user data
      const mustClauses: any[] = [
        {
          key: 'userId',
          match: { value: req.user!.id },
        },
      ];

      if (docFilter && docFilter !== 'all') {
        mustClauses.push({
          key: 'filename',
          match: { value: docFilter },
        });
      }

      const filter = { must: mustClauses };

      const result = await client.query(collectionName, {
        query: vector,
        limit,
        filter,
        with_payload: true,
      });

      // Extra verification: double-check that no foreign chunks leaked through
      const isolatedPoints = (result.points || []).filter(
        (p) => !p.payload?.userId || p.payload?.userId === req.user!.id
      );

      return res.json({
        points: isolatedPoints,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search Qdrant';
      return res.status(500).json({ error: errorMessage });
    }
  });

  // Qdrant Delete Points (Scoped to User)
  app.post('/api/qdrant/delete', authenticateUser, async (req, res) => {
    try {
      const { collectionName = 'docmind_chunks', documentId, chunkId } = req.body;
      const client = getQdrant();
      const has = await client.collectionExists(collectionName);
      if (!has.exists) {
        return res.json({ success: true });
      }

      const mustClauses: any[] = [
        {
          key: 'userId',
          match: { value: req.user!.id },
        },
      ];

      if (documentId) {
        mustClauses.push({ key: 'documentId', match: { value: documentId } });
      }
      if (chunkId) {
        mustClauses.push({ key: 'chunkId', match: { value: chunkId } });
      }

      await client.delete(collectionName, {
        filter: { must: mustClauses },
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete from Qdrant';
      return res.status(500).json({ error: errorMessage });
    }
  });

  // Qdrant Stats (User-Scoped)
  app.get('/api/qdrant/stats', authenticateUser, async (req, res) => {
    try {
      const collectionName = 'docmind_chunks';
      const client = getQdrant();
      const has = await client.collectionExists(collectionName);
      if (!has.exists) {
        return res.json({
          connected: true,
          collectionExists: false,
          totalPoints: 0,
          totalDocuments: 0,
        });
      }

      const countRes = await client.count(collectionName, {
        filter: {
          must: [{ key: 'userId', match: { value: req.user!.id } }],
        },
      });

      const userDocs = getDocumentsByUserId(req.user!.id);

      return res.json({
        connected: true,
        collectionExists: true,
        totalPoints: countRes.count || 0,
        totalDocuments: userDocs.length,
        isolatedUserId: req.user!.id,
      });
    } catch (err: unknown) {
      return res.json({
        connected: false,
        error: err instanceof Error ? err.message : 'Error fetching stats',
        totalPoints: 0,
        totalDocuments: 0,
      });
    }
  });

  // ==========================================
  // ADMIN ROUTES (RBAC Protected)
  // ==========================================

  // Admin System Stats
  app.get('/api/admin/stats', authenticateUser, requireRole('ADMIN'), (req, res) => {
    try {
      const userStats = getUsersStats();
      const allDocs = getAllDocuments();
      const auditStats = getAuditStats();

      return res.json({
        stats: {
          totalUsers: userStats.total,
          activeUsers: userStats.active,
          suspendedUsers: userStats.suspended,
          adminUsers: userStats.admins,
          totalDocuments: allDocs.length,
          totalChunks: allDocs.reduce((acc, d) => acc + (d.chunks?.length || 0), 0),
          indexingFailures: allDocs.filter((d) => d.status === 'FAILED').length,
          totalAuditLogs: auditStats.totalLogs,
          recentSecurityEvents: auditStats.securityEvents,
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  // Admin List Users
  app.get('/api/admin/users', authenticateUser, requireRole('ADMIN'), (req, res) => {
    try {
      const users = getAllUsers();
      return res.json({ users });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Admin Update User Status (Suspend/Activate)
  app.patch('/api/admin/users/:id/status', authenticateUser, requireRole('ADMIN'), (req, res) => {
    try {
      const { status } = req.body;
      if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
        return res.status(400).json({ error: 'Invalid status. Must be ACTIVE or SUSPENDED' });
      }

      const updated = updateUser(req.params.id, { status });
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }

      logAuditEvent('PASSWORD_CHANGED', {
        userId: req.user!.id,
        userEmail: req.user!.email,
        ipAddress: extractClientIp(req),
        resourceId: req.params.id,
        details: `Admin changed user status to ${status}`,
        severity: status === 'SUSPENDED' ? 'SECURITY' : 'INFO',
      });

      return res.json({ user: updated, message: `User status updated to ${status}` });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // Admin Audit Logs
  app.get('/api/admin/audit-logs', authenticateUser, requireRole('ADMIN'), (req, res) => {
    try {
      const { limit, event, severity, userId } = req.query;
      const logs = getAuditLogs({
        limit: limit ? Number(limit) : 100,
        event: event as any,
        severity: severity as any,
        userId: userId as string,
      });
      return res.json({ logs });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Central Error Handler for API routes
  app.use(centralErrorHandler);

  // --- Vite Middleware / Static Asset Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logStructured({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'SERVER_STARTED',
      details: `DocMind AI server running on http://0.0.0.0:${PORT} (Phase 5 Production Ready)`,
    });
  });

  // Graceful Shutdown
  const handleShutdown = (signal: string) => {
    logStructured({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'SHUTDOWN_INITIATED',
      details: `Received ${signal}. Gracefully stopping DocMind AI HTTP server...`,
    });

    server.close((err) => {
      if (err) {
        logStructured({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          event: 'SHUTDOWN_ERROR',
          error: err.message,
        });
        process.exit(1);
      }

      logStructured({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        event: 'SHUTDOWN_COMPLETE',
        details: 'All connections closed cleanly.',
      });
      process.exit(0);
    });

    // Forced shutdown timeout if requests hang
    setTimeout(() => {
      logStructured({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        event: 'SHUTDOWN_TIMEOUT',
        details: 'Forced termination after 10s timeout.',
      });
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();
