import fs from "node:fs/promises";
import path from "node:path";
import { createWorker } from "tesseract.js";
import type { ResourceKind, ResourceStatus } from "./types";

export interface ExtractResult {
  text: string;
  pages?: number;
  status: ResourceStatus;
  note: string;
}

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".tex",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

function extension(name: string) {
  return path.extname(name).toLowerCase();
}

export function inferKind(name: string): ResourceKind {
  const lower = name.toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension(lower))) return "photo";
  if (/syllabus/.test(lower)) return "syllabus";
  if (/(question|qb|bank|practice|exercise)/.test(lower)) return "question-bank";
  if (/(paper|exam|test|may|nov|20\d{2})/.test(lower)) return "past-paper";
  if (TEXT_EXTENSIONS.has(extension(lower)) || extension(lower) === ".pdf") return "textbook";
  return "notes";
}

async function ocrImage(filePath: string) {
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(filePath);
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractFile(
  filePath: string,
  fileName: string
): Promise<ExtractResult> {
  const ext = extension(fileName);

  try {
    if (TEXT_EXTENSIONS.has(ext)) {
      const text = await fs.readFile(filePath, "utf8");
      const lines = text.split("\n").length;
      return {
        text,
        status: "parsed",
        note: `Parsed cleanly. ${lines} lines indexed.`,
      };
    }

    if (ext === ".pdf") {
      const { PDFParse } = await import("pdf-parse");
      const data = await fs.readFile(filePath);
      const parser = new PDFParse({ data });
      try {
        const result = await parser.getText();
        const text = result.text.trim();
        const pages = result.total ?? 0;
        if (text.length < 60) {
          return {
            text,
            pages,
            status: "ocr-low",
            note: "This PDF looks scanned and has almost no readable text. Upload a clearer scan or proceed anyway.",
          };
        }
        return {
          text,
          pages,
          status: "parsed",
          note: `Parsed cleanly. ${pages} pages indexed.`,
        };
      } finally {
        await parser.destroy();
      }
    }

    if (IMAGE_EXTENSIONS.has(ext)) {
      const { text, confidence } = await ocrImage(filePath);
      if (text.length < 40 || confidence < 55) {
        return {
          text,
          status: "ocr-low",
          note: `OCR confidence ${Math.round(confidence)}% - upload a clearer photo or proceed anyway.`,
        };
      }
      return {
        text,
        status: "parsed",
        note: `Photo transcribed locally at ${Math.round(confidence)}% confidence. ${text.length} characters indexed.`,
      };
    }

    return {
      text: "",
      status: "gap",
      note: `Unsupported file type "${ext}". Use PDF, text, Markdown, CSV, JSON, LaTeX, or an image.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      text: "",
      status: "ocr-low",
      note: `Extraction failed (${message}). Re-upload or proceed anyway.`,
    };
  }
}
