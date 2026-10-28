/**
 * Photos made ready to upload, in the browser: a sensible size (2560 px on the long side is plenty to
 * zoom into on a screen, and a fraction of a phone camera's 12–48 MP), as a JPG — so an iPhone's HEIC
 * opens in any browser. A picture that's already small is left exactly as it is.
 */

/** The long side of a photo as uploaded. */
export const PHOTO_EDGE = 2560;
const QUALITY = 0.85;

/** A picture the browser can open and the program can redraw (not an animated GIF, not a PDF). */
export const isPhoto = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

/** The picture, opened (turned the right way up — browsers read the camera's rotation tag). */
export async function openPicture(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // (Decoded: the pixels stay with the image.)
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** A canvas as a JPG file, named after the original. */
export async function toJpeg(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITY));
  if (!blob) throw new Error("The photo couldn't be saved");
  return new File([blob], `${name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

/** Width and height scaled so the long side is at most `edge`. */
export const fit = (w: number, h: number, edge = PHOTO_EDGE) => {
  const k = Math.min(1, edge / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))] as const;
};

/**
 * The photo, ready to upload. Anything that isn't a photo — or a photo this browser can't open (an
 * iPhone HEIC on a Windows PC) — comes back unchanged.
 */
export async function preparePhoto(file: File): Promise<File> {
  if (!isPhoto(file)) return file;
  try {
    const img = await openPicture(file);
    const [w, h] = fit(img.naturalWidth, img.naturalHeight);
    const heic = /hei[cf]/i.test(file.type + file.name);
    // (Already small: kept exactly — a screenshot stays a sharp PNG.)
    if (!heic && w === img.naturalWidth && file.size <= 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // (A PNG's see-through parts: white, as on the page — a JPG has no see-through.)
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = await toJpeg(canvas, file.name);
    // (Whichever's smaller — except a HEIC, always turned into a JPG so it opens anywhere.)
    return out.size < file.size || heic ? out : file;
  } catch {
    return file;
  }
}
