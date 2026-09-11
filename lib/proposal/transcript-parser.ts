import "server-only";
import mammoth from "mammoth";

const SUPPORTED_EXTENSIONS = [".txt", ".docx", ".pdf"] as const;

export function isSupportedTranscriptFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Extracts plain text from an uploaded transcript file. Supports .txt,
 * .docx, and .pdf (decision, progress.md: reopened from plain-text-paste
 * per user request, scoped to these three formats).
 *
 * Named limitation: PDF extraction reads embedded text only - a scanned or
 * image-only PDF (no text layer) will yield little or nothing, since that
 * would require OCR, out of scope for this build.
 */
export async function extractTranscriptText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (lower.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (lower.endsWith(".pdf")) {
    // `pdf-parse` bundles `pdfjs-dist`, which references the browser-only
    // `DOMMatrix` API at module-evaluation time (not lazily, inside a
    // function) - a static top-level import of it crashes the ENTIRE module
    // on Node runtimes that don't define DOMMatrix (confirmed: Vercel's
    // serverless Node runtime), taking down every route that imports this
    // file, not just PDF-transcript requests. Polyfilling before a dynamic
    // (lazy) import fixes both problems: the crash only happens if a PDF is
    // actually uploaded, and the polyfill makes it not crash even then.
    if (typeof globalThis.DOMMatrix === "undefined") {
      const { default: DOMMatrixPolyfill } = await import("dommatrix");
      (globalThis as typeof globalThis & { DOMMatrix: unknown }).DOMMatrix = DOMMatrixPolyfill;
    }

    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(`Unsupported transcript file type: ${file.name}`);
}
