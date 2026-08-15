import Papa from 'papaparse';
import { ExtractedSection } from '../../types';
import { countWords } from './textCleaner';

/**
 * Parses CSV documents into structured, RAG-embeddable section blocks.
 * Preserves column headers, row associations, and metadata.
 */
export function parseCsvContent(
  rawCsv: string,
  documentId: string,
  filename: string
): ExtractedSection[] {
  if (!rawCsv || !rawCsv.trim()) {
    return [];
  }

  const parseResult = Papa.parse<Record<string, string>>(rawCsv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = parseResult.data;
  const headers = parseResult.meta.fields || [];

  if (rows.length === 0 && headers.length === 0) {
    return [];
  }

  const sections: ExtractedSection[] = [];
  const BATCH_SIZE = 15; // Group rows into logical chunks/sections

  // First section: Table Metadata & Schema overview
  const headerOverview = [
    `# Dataset: ${filename}`,
    `Total Columns: ${headers.length} [${headers.join(', ')}]`,
    `Total Rows: ${rows.length}`,
  ].join('\n');

  sections.push({
    documentId,
    filename,
    sectionIndex: 0,
    title: 'CSV Structure & Schema',
    text: headerOverview,
    charCount: headerOverview.length,
    wordCount: countWords(headerOverview),
  });

  // Convert batches of rows to semantic key-value textual records
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchRows = rows.slice(i, i + BATCH_SIZE);
    const rowLines: string[] = [];

    batchRows.forEach((row, idx) => {
      const rowNum = i + idx + 1;
      const entries = Object.entries(row)
        .filter(([_, val]) => val !== undefined && val !== null && val !== '')
        .map(([col, val]) => `${col}: ${val}`);

      if (entries.length > 0) {
        rowLines.push(`[Record ${rowNum}] ${entries.join(' | ')}`);
      }
    });

    if (rowLines.length > 0) {
      const sectionText = rowLines.join('\n');
      sections.push({
        documentId,
        filename,
        sectionIndex: sections.length,
        title: `Records ${i + 1} - ${Math.min(i + BATCH_SIZE, rows.length)}`,
        text: sectionText,
        charCount: sectionText.length,
        wordCount: countWords(sectionText),
      });
    }
  }

  return sections;
}
