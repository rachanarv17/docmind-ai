# DocMind AI

> **Secure Multi-Tenant Retrieval-Augmented Generation Platform**

DocMind AI is an enterprise-grade, multi-tenant Retrieval-Augmented Generation (RAG) platform built with React 19, Node.js 20, TypeScript, Tailwind CSS, Google Gemini models (`gemini-2.5-flash` & `gemini-embedding-2`), and Qdrant Vector Database.

---

## 1. Project Overview

DocMind AI enables teams and individuals to ingest complex multi-format documents, generate dense 768-dimensional semantic embeddings, perform hybrid vector-keyword retrieval with reciprocal rank fusion, and generate factual answers grounded in verifiable document citations with full tenant data isolation.

---

## 2. Problem Statement

Standard generative AI assistants suffer from knowledge cutoffs, hallucinations, and lack of verifiable citations. Enterprise RAG applications often face severe security vulnerabilities:
- **Tenant Data Leakage**: Users retrieving vectors or metadata belonging to other accounts.
- **Prompt Injections**: Malicious instructions embedded in uploaded files hijacking model directives.
- **Unverified Citations**: Models inventing references or pointing to irrelevant context.
- **Fragile Parsing**: Inconsistent chunking across unstructured PDFs, DOCX, and CSV spreadsheets.

DocMind AI resolves these challenges through deterministic parsing, server-enforced vector payload filtering, strict evidence grounding, and defense-in-depth authorization.

---

## 3. Key Features

- **Multi-Format Ingestion**: Native extraction for PDF, DOCX, TXT, Markdown, and CSV files.
- **Deterministic Semantic Chunking**: Configurable token budgeting with overlap and boundary preservation.
- **Dense 768-Dim Embeddings**: Powered by Google GenAI `models/gemini-embedding-2`.
- **Persistent Qdrant Vector Store**: Filtered multi-tenant vector storage with cosine distance metrics.
- **Hybrid Retrieval Engine**: Vector similarity + BM25 keyword matching fused with Reciprocal Rank Fusion (RRF).
- **Grounded Conversational Synthesis**: Answers derived strictly from retrieved context via `gemini-2.5-flash`.
- **Verifiable Chunk Citations**: Real-time citations linking claims to exact document chunks and page numbers.
- **Unknown-Answer Refusal**: Explicit refusal when document context does not contain sufficient evidence.
- **Full-Stack Authentication & RBAC**: Password hashing via `bcryptjs`, JWT session cookies, and role-based permissions (`USER`, `ADMIN`).
- **Strict Multi-Tenant Isolation**: Server-enforced Qdrant filtering ensuring User A cannot retrieve User B's documents.
- **Prompt Injection Defense**: Untrusted context tagging, escape sanitization, and override detection heuristics.
- **Production-Ready Observability**: Structured JSON logging, Request Correlation (`X-Request-ID`), and audit trail.

---

## 4. RAG Architecture

```text
Document Upload ──▶ File Validator ──▶ Format Parser (PDF/DOCX/TXT/MD/CSV)
       │
       ▼
Deterministic Chunking (300-600 tokens + overlap)
       │
       ▼
Gemini Embeddings (gemini-embedding-2, 768-dim) ──▶ Qdrant Vector DB (with userId metadata)
       │
       ▼
User Query ──▶ Query Vector ──▶ Multi-Tenant Hybrid Search (userId filter)
       │
       ▼
Rank Fusion Context ──▶ Grounded Prompt Guardrails ──▶ Gemini 2.5 Flash ──▶ Factual Answer + Citations
```

---

## 5. Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React, Motion
- **Backend**: Node.js 20, Express, TypeScript, tsx, esbuild
- **AI & Embeddings**: `@google/genai` (`gemini-2.5-flash`, `gemini-embedding-2`)
- **Vector Database**: `@qdrant/js-client-rest` (Qdrant v1.13.2)
- **Document Extractors**: `pdfjs-dist` (PDF), `mammoth` (DOCX), `papaparse` (CSV)
- **Security & Middleware**: `bcryptjs`, `jsonwebtoken`, `helmet`, `cookie-parser`, `cors`, `express-rate-limit`
- **Testing**: `vitest`

---

## 6. Supported Document Formats

| Format | Extension | Extractor Engine | Chunking Strategy |
|---|---|---|---|
| PDF | `.pdf` | PDF.js with OCR fallback notice | Page-by-page preservation with 1-indexed markers |
| Word Document | `.docx` | Mammoth HTML converter | Heading and paragraph semantic block extraction |
| Plain Text | `.txt` | Native stream reader | Sentence & paragraph boundary splitting |
| Markdown | `.md` | Markdown AST parser | Header hierarchy and section-based chunking |
| Spreadsheet | `.csv` | PapaParse | Structured row-by-row field serialization |

---

## 7. Installation & Setup

### Prerequisites
- Node.js 20+
- npm 10+
- Qdrant instance (or local Docker container)
- Google Gemini API Key

### Step 1: Clone Repository
```bash
git clone https://github.com/your-username/docmind-ai.git
cd docmind-ai
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your variables in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=
AUTH_SECRET=your_super_secret_jwt_key_minimum_32_characters
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
PORT=3000
```

### Step 4: Start Qdrant Vector Database
Using Docker Compose:
```bash
docker compose up -d qdrant
```

### Step 5: Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 8. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts development server with hot reload and Vite middleware |
| `npm run build` | Builds Vite frontend and bundles standalone Node.js production server |
| `npm run start` | Launches compiled production server (`dist/server.cjs`) |
| `npm test` | Runs complete Vitest test suite (53/53 tests) |
| `npm run typecheck` | Validates TypeScript types across the entire codebase |
| `npm run lint` | Runs ESLint / TypeScript linter checks |

---

## 9. Docker Deployment

### Multi-Stage Build
Build the optimized production container:
```bash
docker build -t docmind-ai:latest .
```

### Run Container
```bash
docker run -d \
  -p 3000:3000 \
  -e GEMINI_API_KEY="your_api_key" \
  -e QDRANT_URL="http://host.docker.internal:6333" \
  -e AUTH_SECRET="production_jwt_secret_key_32_chars" \
  --name docmind-app \
  docmind-ai:latest
```

---

## 10. API Reference

### Health & Observability
- `GET /api/health`: System uptime, Gemini status, Qdrant latency, and database health.

### Authentication
- `POST /api/auth/register`: Create user account (`name`, `email`, `password`).
- `POST /api/auth/login`: Authenticate and issue secure JWT cookie.
- `POST /api/auth/logout`: Clear session cookies.
- `GET /api/auth/me`: Retrieve active authenticated profile.
- `POST /api/auth/change-password`: Secure password change with verification.

### Document Operations (Protected)
- `POST /api/documents/upload`: Upload and validate documents (PDF, DOCX, TXT, MD, CSV).
- `GET /api/documents`: List documents owned by the authenticated user.
- `GET /api/documents/:id`: Retrieve single document metadata.
- `DELETE /api/documents/:id`: Delete document and remove associated Qdrant vectors.
- `POST /api/documents/:id/reindex`: Re-process and re-embed document chunks.

### Grounded RAG Chat (Protected)
- `POST /api/chat`: Multi-tenant grounded query with exact chunk citations.

### Admin Governance (Admin Only)
- `GET /api/admin/stats`: Aggregate system metrics and health statistics.
- `GET /api/admin/users`: List registered accounts and statuses.
- `PATCH /api/admin/users/:id/status`: Suspend or reactivate user accounts.
- `GET /api/admin/audit-logs`: Query structured security audit records.

---

## 11. Security Architecture

1. **Strict Tenant Isolation**: Server queries Qdrant with `userId = authenticatedUser.id` filter.
2. **Untrusted Context Guardrails**: Document chunks are encapsulated within `<document_context>` XML tags and treated strictly as untrusted data.
3. **Defense-in-Depth Rate Limiting**: Per-IP rate limits across authentication, uploads, and AI chat endpoints.
4. **Audit Logging**: Structured audit trail tracking critical security lifecycle events.

For detailed security policies, see [docs/SECURITY.md](docs/SECURITY.md).

---

## 12. Project Structure

```text
├── docs/
│   ├── ARCHITECTURE.md          # Comprehensive architectural specification
│   └── SECURITY.md              # Security model, RBAC, and threat defenses
├── server/
│   ├── auth/                    # JWT tokens and password hashing
│   ├── db/                      # Persistent stores (Users, Documents, Audit)
│   ├── middleware/              # Auth, RBAC, Rate limiting, Error handlers
│   ├── security/                # File validators & Prompt injection defenses
│   ├── utils/                   # Structured logger and Request correlation
│   └── __tests__/               # Security & Multi-tenancy test suites
├── src/
│   ├── components/              # UI Components (Chat, Documents, Admin, Auth)
│   ├── lib/
│   │   ├── ingestion/           # Document parsers & Chunker logic
│   │   └── vector/              # Embeddings, Hybrid RAG, & Qdrant client
│   ├── types.ts                 # Shared TypeScript interfaces & types
│   ├── App.tsx                  # Root application component
│   └── main.tsx                 # Entry point
├── Dockerfile                   # Production multi-stage Docker build
├── docker-compose.yml           # Local service orchestrator
├── server.ts                    # Production Express + Vite server entry point
├── package.json                 # Dependency manifests and scripts
└── vite.config.ts               # Vite build configuration
```

---

## 13. Known Limitations & Roadmap

### Current Limitations
- Single-instance in-memory rate-limiter counters reset during process restarts (suitable for scale-to-zero container hosting).
- OCR for scanned, image-only PDFs outputs an informational banner if textual layers are empty.

### Future Roadmap
- Distributed Redis caching for global rate limiting and session blacklisting.
- Asynchronous Celery/BullMQ ingestion queues for large batch document uploads (>100 files).
- Semantic reranking layer (e.g., Cohere or Flash Rerank) for ultra-high-precision hybrid retrieval.

---

## 14. License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
