import { DocumentItem } from '../../types';
import { processDocumentFile } from './pipeline';

const SAMPLE_MARKDOWN = `# Q3 Financial Performance & Growth Analysis

## Executive Summary
DocMind Financial Intelligence Unit has consolidated Q3 performance metrics. The company achieved a record total recurring revenue of $14.2M, representing a 24.8% Year-over-Year increase. Operating cash flow reached $3.1M with sustained gross margin expansion to 78.4%.

## Revenue Distribution by Segment
- Enterprise Document Intelligence: $8.6M (60.5% of total)
- Compliance & Legal Extraction Suite: $3.4M (23.9% of total)
- Research & Quantitative Parsing Tools: $2.2M (15.6% of total)

## Cost Structure & Capital Allocation
Research & Development expenditures totaled $4.1M, dedicated to transformer latency reduction and automated OCR parsing pipelines. Sales & Marketing expenses were stabilized at $2.8M with customer acquisition payback under 5 months.

## Risk Factors & Outlook
Key forward-looking risks include foreign exchange currency volatility and evolving EU AI Act data governance obligations. Target revenue guidance for Q4 is revised upward to $16.5M.`;

const SAMPLE_CSV = `ContractId,Vendor,Category,AnnualValue,Status,SLA,RenewalNoticeDays
CTR-101,Apex Cloud Infrastructure,Hosting,$480000,Active,99.99%,60
CTR-102,Vertex Security Labs,Compliance,$120000,Active,99.95%,30
CTR-103,DataVector Analytics,Pipelines,$210000,Active,99.90%,45
CTR-104,GlobalLex Legal Partners,Legal Advisory,$95000,Under Review,99.50%,15
CTR-105,NeuralScale Compute,Inference Compute,$650000,Active,99.99%,90`;

const SAMPLE_TXT = `DocMind AI Enterprise Security & Data Governance Specification

1. Security Architecture Overview
All document payloads ingested into DocMind AI are processed in isolated, memory-safe execution sandboxes. Ingestion pipelines enforce AES-256 data encryption at rest and TLS 1.3 protocol encryption in transit.

2. Access Control Policies
Role-Based Access Control (RBAC) is enforced at the organization, repository, and document level. Authentication tokens are verified on every API request. Multi-Factor Authentication (MFA) is mandatory for all administrative access.

3. Compliance Certifications
The platform maintains active compliance with SOC 2 Type II audit requirements, ISO/IEC 27001 standards for Information Security Management, and HIPAA data isolation guidelines.

4. Audit Logging & Retention Policy
Every file validation, parser execution, and chunk extraction event is logged with microsecond timestamp accuracy. Audit records are maintained in write-once-read-many (WORM) storage for 365 days.`;

const SAMPLE_TECH_SPEC = `# Transformer Optimization & Multi-Query Attention Architecture

## Introduction
Modern document understanding pipelines encounter significant memory bottlenecks when scaling sequence lengths. This technical specification outlines the optimization of Key-Value (KV) cache memory footprint.

## Multi-Query and Grouped-Query Attention
By sharing key and value projection heads across multiple query attention heads, memory bandwidth requirements are reduced by 4.2x during autoregressive decoding. 

## Benchmark Results
- End-to-end token latency reduced by 35% on multi-page PDF workloads.
- Memory consumption decreased from 14.8GB to 3.5GB per concurrent ingestion worker.
- Document parsing accuracy maintained at 99.8% precision across diverse typographic layouts.`;

export async function generateInitialRealDocuments(): Promise<DocumentItem[]> {
  const docs: DocumentItem[] = [];

  // Doc 1: Real Markdown Document
  const doc1 = await processDocumentFile({
    name: 'Q3_Financial_Performance.md',
    size: SAMPLE_MARKDOWN.length,
    content: SAMPLE_MARKDOWN,
  });
  docs.push(doc1);

  // Doc 2: Real CSV Document
  const doc2 = await processDocumentFile({
    name: 'Vendor_Contracts_2026.csv',
    size: SAMPLE_CSV.length,
    content: SAMPLE_CSV,
  });
  docs.push(doc2);

  // Doc 3: Real TXT Document
  const doc3 = await processDocumentFile({
    name: 'Enterprise_Security_Spec.txt',
    size: SAMPLE_TXT.length,
    content: SAMPLE_TXT,
  });
  docs.push(doc3);

  // Doc 4: Real Markdown Tech Spec
  const doc4 = await processDocumentFile({
    name: 'Transformer_Architecture_Spec.md',
    size: SAMPLE_TECH_SPEC.length,
    content: SAMPLE_TECH_SPEC,
  });
  docs.push(doc4);

  return docs;
}
