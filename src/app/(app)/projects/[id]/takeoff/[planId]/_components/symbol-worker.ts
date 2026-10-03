/// <reference lib="webworker" />
// Auto-count runs here so the plan stays responsive while a sheet is searched.
import { findSymbols, type Gray } from "@/lib/symbol-match";

self.onmessage = (e: MessageEvent<{ img: Gray; sample: Gray }>) => {
  const { img, sample } = e.data;
  try {
    const matches = findSymbols(img, sample, { onProgress: (f) => self.postMessage({ progress: f }) });
    self.postMessage({ matches });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : "Search failed" });
  }
};
