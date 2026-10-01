import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

/**
 * Serves pdf.js runtime assets (worker, image decoders, fonts, character maps)
 * straight from node_modules/pdfjs-dist for the takeoff plan viewer.
 * Only these folders and plain file names are allowed.
 */
const DIRS: Record<string, string[] | null> = {
  build: ["pdf.worker.min.mjs"],
  wasm: null,
  cmaps: null,
  standard_fonts: null,
  iccs: null,
};

const TYPES: Record<string, string> = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  if (parts.length !== 2) return new NextResponse("Not found", { status: 404 });
  const [dir, file] = parts;
  if (!(dir in DIRS) || !/^[\w.-]+$/.test(file) || file.startsWith(".")) return new NextResponse("Not found", { status: 404 });
  const allowed = DIRS[dir];
  if (allowed && !allowed.includes(file)) return new NextResponse("Not found", { status: 404 });

  try {
    const data = await fs.readFile(path.join(process.cwd(), "node_modules", "pdfjs-dist", dir, file));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
