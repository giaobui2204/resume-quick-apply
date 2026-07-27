import mammoth from "mammoth";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractResumeText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  if (file.type === PDF_MIME) {
    text = await extractPdfText(buffer);
  } else if (file.type === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    throw new Error("Unsupported resume type");
  }

  const normalized = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (normalized.length < 30) {
    throw new Error("The resume contains too little readable text. Scanned-image resumes are not supported yet.");
  }
  return normalized.slice(0, 100_000);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolvePdfWorker()).href;
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true
  }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return pages.join("\n");
}

function resolvePdfWorker(): string {
  const relativeWorker = "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
  const candidates = [
    resolve(process.cwd(), relativeWorker),
    resolve(process.cwd(), "..", relativeWorker),
    resolve(process.cwd(), "..", "..", relativeWorker)
  ];
  const worker = candidates.find(existsSync);
  if (!worker) throw new Error("PDF.js worker was not found in the installed dependencies.");
  return worker;
}
