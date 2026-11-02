/**
 * A saved file's address for an <img>, with a version mark that changes when the file does (a photo
 * marked up, or its markup undone) — so the page shows the new picture, not the one it had.
 */
export function fileSrc(f: { id: string; storagePath: string }) {
  let h = 5381;
  for (let i = 0; i < f.storagePath.length; i++) h = ((h << 5) + h + f.storagePath.charCodeAt(i)) | 0;
  return `/api/files/${f.id}?v=${(h >>> 0).toString(36)}`;
}

/** Photos the markup screen can open (what a browser draws). */
export const markable = (mimeType: string) => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType);
