import { parentPort, workerData } from "node:worker_threads";
import { fileURLToPath, URL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
try {
  const task = getDocument({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
    standardFontDataUrl: fileURLToPath(
      new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
    ),
    cMapUrl: fileURLToPath(
      new URL("../../node_modules/pdfjs-dist/cmaps/", import.meta.url),
    ),
    cMapPacked: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const pages = [];
  const count = Math.min(doc.numPages, 30);
  let chars = 0;
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((i) => "str" in i)
      .map((i) => i.str)
      .join(" ");
    pages.push(`[Page ${i}] ${text}`);
    chars += text.length;
    if (chars > 30000) break;
  }
  parentPort.postMessage({
    text: pages.join("\n").slice(0, 30000),
    pages: doc.numPages,
    processedPages: pages.length,
    truncated: pages.length < doc.numPages || chars > 30000,
  });
  await task.destroy();
} catch {
  parentPort.postMessage({ error: "PDF text extraction failed." });
}
