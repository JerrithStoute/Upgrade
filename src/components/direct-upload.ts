/**
 * The browser's half of an upload straight to cloud storage (src/lib/direct-upload.ts): ask for a link,
 * send the file to it with its progress, then the caller hands the ticket back to be checked and recorded.
 * When files don't go direct, startDirect says so and the caller sends the file the old way.
 */

export type Started = { direct: false } | { direct: true; url: string; ticket: string };

/** Step 1: may this file go straight to cloud storage? Throws with the reason when it can't be uploaded at all. */
export async function startDirect(projectId: string, purpose: "plan" | "file", file: File): Promise<Started> {
  const res = await fetch("/api/uploads/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, purpose, name: file.name, size: file.size }),
  });
  const body = (await res.json().catch(() => ({}))) as Started & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body;
}

/** Step 2: the file, sent to its link, with how far along it is (0–100). */
export function putFile(url: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`“${file.name}” didn't upload (${xhr.status}) — try again`)));
    xhr.onerror = () => reject(new Error(`“${file.name}” didn't upload — check your connection and try again`));
    xhr.send(file);
  });
}
