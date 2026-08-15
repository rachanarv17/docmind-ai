# DocMind AI — Architecture Documentation

DocMind AI is a production-grade, multi-tenant Retrieval-Augmented Generation (RAG) platform. It provides document ingestion, high-dimensional semantic vector indexing, hybrid retrieval, and grounded response generation with verifiable page/chunk citations while enforcing strict multi-tenant isolation.

---

## 1. High-Level System Architecture

```text
+-------------------------------------------------------------------------------+
|                                  CLIENT TIER                                  |
|  React 19 + TypeScript + Tailwind CSS SPA                                     |
|  - Role-Aware Dashboard & Document Management (Upload, Parse, Index, Delete)  |
|  - Grounded Conversational RAG UI with Real-time Citations & Chunk Viewer     |
|  - Admin Governance Portal (Audit Logs, User Suspension, Metrics)             |
+---------------------------------------+---------------------------------------+
                                        | HTTPS / httpOnly JWT Cookie / Bearer
                                        v
+-------------------------------------------------------------------------------+
|                            SERVER & SECURITY TIER                             |
|  Node.js 20 + Express Production Backend (dist/server.cjs)                    |
|  - Helmet Security Headers & CORS Origin Locking                              |
|  - Rate Limiters (Auth, Chat, Upload, General API)                            |
|  - Request Correlation & Structured Logging (X-Request-ID)                    |
|  - Authentication & RBAC Middleware (USER / ADMIN, ACTIVE / SUSPENDED)        |
|  - Prompt Injection Heuristics & Boundary Sanitization                        |
+-------------------+---------------------------------------+-------------------+
                    |                                       |
                    v                                       v
+-----------------------------------+   +---------------------------------------+
|     DOCUMENT INGESTION ENGINE     |   |         HYBRID RETRIEVAL ENGINE       |
|  - PDF (PDF.js page extraction)   |   |  1. Dense Semantic Search (Qdrant)    |
|  - DOCX (Mammoth HTML structure)  |   |  2. Lexical Search (BM25 / Keyword)   |
|  - TXT, Markdown, CSV Parsers     |   |  3. Reciprocal Rank Fusion (RRF)      |
|  - Deterministic Semantic Chunker |   |  4. Tenant Scope Filter Enforcement   |
+-------------------+---------------+   +-------------------+-------------------+
                    |                                       |
                    v                                       v
+-------------------------------------------------------------------------------+
|                          EXTERNAL SERVICES & STORAGE                          |
|  - Google Gemini API:                                                         |
|      * gemini-embedding-2 (768-dim embeddings for chunks & queries)           |
|      * gemini-2.5-flash (Grounded synthesis with citation verification)       |
|  - Qdrant Vector Database: Persistent collections with indexed userId payload |
|  - App Data Stores: Multi-tenant user credentials, documents, audit logs      |
+-------------------------------------------------------------------------------+
```

---

## 2. Ingestion & Indexing Pipeline

```text
[Document Upload]
       │
       ▼
[File Validation] ──▶ Reject >25MB, malformed, or executable extensions
       │
       ▼
[Format-Specific Parsing]
       ├── PDF: Page-by-page text extraction with 1-indexed page markers
       ├── DOCX: Paragraph & heading hierarchy extraction
       ├── CSV: Structured row-by-row field serialization
       ├── Markdown: Heading/section extraction
       └── Plain Text: Normalized newline & paragraph extraction
       │
       ▼
[Deterministic Chunking]
       ├── Token budgeting (300–600 tokens / 1200–2400 chars)
       ├── Overlap sliding window (50–100 tokens)
       └── Boundary preservation (sentence, paragraph, and heading breaks)
       │
       ▼
[Embedding Generation]
       └── Google GenAI SDK: `models/gemini-embedding-2` (768 dimensions)
       │
       ▼
[Qdrant Multi-Tenant Upsert]
       └── Point Payload:
           {
             "userId": "usr_...",
             "documentId": "doc_...",
             "chunkId": "doc_..._chunk_0",
             "filename": "annual_report.pdf",
             "pageNumber": 1,
             "sectionIndex": 0,
             "chunkIndex": 0,
             "text": "..."
           }
```

---

## 3. Grounded Retrieval & Generation Flow

```text
[User Query: "What was Q3 revenue?"]
       │
       ▼
[Authentication & Ownership Verification]
       └── Extract `userId` from verified server-side JWT session token
       │
       ▼
[Query Vectorization]
       └── Generate 768-dim embedding via `gemini-embedding-2`
       │
       ▼
[Multi-Tenant Qdrant Hybrid Search]
       ├── Server-enforced payload filter: `must: [{ key: "userId", match: { value: userId } }]`
       ├── Semantic similarity scoring (Cosine distance on vector embeddings)
       └── Lexical keyword scoring (Exact phrase & token matching)
       │
       ▼
[Context Aggregation & Rank Fusion]
       ├── Deduplicate & sort retrieved chunks by composite score
       ├── Context window budget enforcement (truncate lower-ranked chunks if >16KB)
       └── Format structured `<document_context>` XML block with chunk IDs
       │
       ▼
[Grounded Gemini Generation]
       ├── Model: `gemini-2.5-flash`
       ├── System Instruction: Strict evidence grounding + untrusted context defense
       └── Response Format: Clear factual answer with real `[doc_..._chunk_X]` citations
       │
       ▼
[Citation Ownership Audit]
       └── Verify returned citations belong strictly to user's authorized chunks
```

---

## 4. Multi-Tenant Security Boundaries

1. **Authentication Token Integrity**: All API routes authenticate requests using `httpOnly` secure cookies or signed `Bearer` tokens signed with the server's `AUTH_SECRET`.
2. **Deterministic Payload Filtering**: Qdrant queries never rely on client-provided tenant identifiers. The server automatically injects the authenticated `userId` into Qdrant filter expressions.
3. **Storage Isolation**: Document CRUD operations, chunk retrieval, and vector deletions are strictly scoped to `(userId, documentId)`.
4. **Untrusted Context Guardrails**: Document chunks inside prompt templates are wrapped with strict delimiters and marked as untrusted data to prevent prompt injection and model jailbreaking.
