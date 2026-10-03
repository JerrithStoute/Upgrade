import { findSymbols, type Gray, type SymbolMatch } from "@/lib/symbol-match";

/**
 * Searches one sheet picture for the sample in a background worker (falls back to
 * the page itself if workers aren't available). Rejects with "cancelled" if `signal` aborts.
 */
export function searchSheet(img: Gray, sample: Gray, onProgress: (f: number) => void, signal: AbortSignal): Promise<SymbolMatch[]> {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./symbol-worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (!worker)
    return new Promise((resolve, reject) =>
      // Let the "Searching…" panel paint first.
      setTimeout(() => {
        if (signal.aborted) return reject(new Error("cancelled"));
        try {
          resolve(findSymbols(img, sample, { onProgress }));
        } catch (e) {
          reject(e);
        }
      }, 30),
    );
  const w = worker;
  return new Promise((resolve, reject) => {
    const stop = () => {
      w.terminate();
      reject(new Error("cancelled"));
    };
    signal.addEventListener("abort", stop, { once: true });
    w.onmessage = (e: MessageEvent<{ progress?: number; matches?: SymbolMatch[]; error?: string }>) => {
      if (e.data.progress != null) return onProgress(e.data.progress);
      signal.removeEventListener("abort", stop);
      w.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.matches ?? []);
    };
    w.onerror = (e) => {
      signal.removeEventListener("abort", stop);
      w.terminate();
      reject(new Error(e.message || "Search failed"));
    };
    w.postMessage({ img, sample }, [img.data.buffer as ArrayBuffer]);
  });
}
