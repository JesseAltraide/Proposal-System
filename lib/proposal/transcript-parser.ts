import "server-only";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

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
