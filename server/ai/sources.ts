import { Worker } from "node:worker_threads";
export type ExtractedPDF = {
  text: string;
  pages: number;
  processedPages: number;
  truncated: boolean;
};
export function extractPdf(data: Uint8Array): Promise<ExtractedPDF> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdf-extract.mjs", import.meta.url), {
      workerData: data,
    });
    let done = false;
    const finish = (error: Error | null, value?: ExtractedPDF) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value!);
    };
    const timeout = setTimeout(
      () => finish(new Error("PDF text extraction timed out.")),
      15000,
    );
    worker.on("message", (v: ExtractedPDF & { error?: string }) =>
      finish(v.error ? new Error(v.error) : null, v),
    );
    worker.on("error", (e) => finish(e));
    worker.on("exit", (code) => {
      if (!done) finish(new Error(`PDF extraction stopped (${code}).`));
    });
  });
}
