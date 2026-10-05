"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crop, HardHat, ImageUp } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { BRAND_PRESETS, DEFAULT_BRAND, brandShades, isHexColor } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { saveBranding } from "./actions";
import { LogoEditor } from "./logo-editor";

/**
 * Logo and main color. The preview shows the picked color as the app will use it
 * (buttons, links, the highlighted menu item) before saving.
 */
export function BrandingForm({ color, logoUrl, companyName }: { color: string | null; logoUrl: string | null; companyName: string }) {
  const [hex, setHex] = useState(isHexColor(color) ? color : DEFAULT_BRAND);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The picture open in the crop & stretch editor (a new file, or the saved logo).
  const [editing, setEditing] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * A logo picked or dropped. What it really is comes from its first bytes (Windows
   * sometimes reports no type, or the wrong one), so the message can say exactly
   * what's wrong. The server checks the contents again when saving.
   */
  const takeFile = async (f: File | null | undefined) => {
    const input = fileInput.current;
    setRemoveLogo(false);
    setLogoError(null);
    const clear = (msg: string) => {
      setLogoError(msg);
      if (input) input.value = "";
      setPreview(null);
    };
    if (!f) return setPreview(null);
    const kind = await sniffImage(f);
    if (kind !== "ok") return clear(kind);
    if (f.size > 10 * 1024 * 1024) return clear(`That picture is ${(f.size / 1024 / 1024).toFixed(1)} MB — use one under 10 MB.`);
    // Open it in the crop & stretch editor; what's saved is the edited PNG.
    if (input) input.value = "";
    setPreview(null);
    setEditing(URL.createObjectURL(f));
  };
  /** The editor's result goes into the form's file field, so Save sends it. */
  const applyEdited = (file: File, url: string) => {
    const input = fileInput.current;
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    }
    setEditing(null);
    setRemoveLogo(false);
    setPreview(url);
  };
  const take = useRef(takeFile);
  useEffect(() => {
    take.current = takeFile;
  });

  // Drop a logo anywhere on the page — a near-miss shouldn't make the browser open the image instead.
  useEffect(() => {
    let depth = 0;
    const isDrag = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === "Files" || t === "text/uri-list" || t === "text/html");
    const enter = (e: DragEvent) => {
      if (!isDrag(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!isDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!isDrag(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!isDrag(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void take.current(file);
      else
        setLogoError(
          "That came from a web page, email or document, not a saved file. Save the logo to your computer first, then drag the file in from File Explorer (or click the box to choose it).",
        );
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const shades = brandShades(hex);
  const shownLogo = preview ?? (removeLogo ? null : logoUrl);

  return (
    <form action={saveBranding} className="space-y-5">
      <input type="hidden" name="brandColor" value={hex} />
      <input type="hidden" name="removeLogo" value={removeLogo ? "1" : ""} />

      {/* Drop a logo anywhere on the page (see above), or click the box to choose one */}
      <div>
        <p className="label">Logo</p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title="Drop a logo here, or click to choose one"
            className={cn(
              "grid place-items-center rounded-lg border-2 border-dashed transition-colors",
              // Empty: a drop area. With a logo: the box hugs the logo's own shape.
              shownLogo && !dragging ? "max-w-[24rem] p-2" : "h-28 w-72 p-2",
              dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-slate-400",
            )}
          >
            {dragging ? (
              <span className="text-sm font-medium text-blue-700">Drop it here</span>
            ) : shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="Logo preview" className="block max-h-24 max-w-full" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs text-slate-500">
                <ImageUp className="h-5 w-5 text-slate-400" />
                Drag your logo here
                <span className="text-slate-400">or click to choose</span>
              </span>
            )}
          </button>
          <div className="space-y-1.5">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
              <ImageUp className="h-4 w-4" /> {logoUrl || preview ? "Replace logo" : "Upload logo"}
              <input ref={fileInput} type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void takeFile(e.target.files?.[0])} />
            </label>
            {shownLogo && !editing ? (
              <button
                type="button"
                onClick={() => setEditing(shownLogo)}
                className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
              >
                <Crop className="h-4 w-4" /> Crop / stretch
              </button>
            ) : null}
            {logoUrl && !preview ? (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={removeLogo} onChange={(e) => setRemoveLogo(e.target.checked)} />
                Remove the logo
              </label>
            ) : null}
            <p className="text-xs text-slate-500">Drag a file onto the box, or use the button. PNG, JPG or WebP — you can crop and stretch it before saving.</p>
            {logoError ? <p className="text-xs font-medium text-rose-600">{logoError}</p> : null}
            {preview && !logoError && !editing ? (
              // Still a deliberate click — just right where you're looking.
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                Not saved yet — your logo won&apos;t change until you save.
                <SubmitButton size="sm" pendingText="Saving…">
                  Save branding
                </SubmitButton>
              </div>
            ) : null}
          </div>
        </div>
        {editing ? (
          <div className="mt-3">
            <LogoEditor src={editing} onDone={applyEdited} onCancel={() => setEditing(null)} />
          </div>
        ) : null}
      </div>

      <div>
        <p className="label">Main color</p>
        <div className="flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={p.name}
              aria-label={p.name}
              onClick={() => setHex(p.hex)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full ring-2 ring-offset-2",
                hex.toLowerCase() === p.hex ? "ring-slate-900" : "ring-transparent hover:ring-slate-300",
              )}
              style={{ background: p.hex }}
            >
              {hex.toLowerCase() === p.hex ? <Check className="h-4 w-4 text-white" /> : null}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-xs text-slate-600">
            Any color
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
              aria-label="Pick any color"
            />
            <span className="font-mono">{hex}</span>
          </label>
        </div>
        {shades[700] !== hex.toLowerCase() ? (
          <p className="mt-1 text-xs text-slate-500">That color is light, so buttons use a darker version of it to keep their text readable.</p>
        ) : null}
      </div>

      {/* Preview, drawn with the picked color's shades */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-60 rounded-lg border border-slate-200 bg-white p-2">
            <div className="mb-2 flex items-center gap-2 px-1">
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownLogo} alt="" className="max-h-14 max-w-[13rem] object-contain" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-md text-white" style={{ background: shades[700] }}>
                  <HardHat className="h-5 w-5" />
                </span>
              )}
              <span className="truncate text-xs font-semibold text-slate-800">{companyName}</span>
            </div>
            <div className="rounded-md px-2 py-1.5 text-sm font-medium" style={{ background: shades[50], color: shades[800] }}>
              Projects
            </div>
            <div className="px-2 py-1.5 text-sm text-slate-600">Clients</div>
          </div>
          <div className="space-y-3">
            <span className="inline-block rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm" style={{ background: shades[700] }}>
              Save estimate
            </span>
            <p className="text-sm">
              A{" "}
              <span className="font-medium underline" style={{ color: shades[700] }}>
                link to a job
              </span>{" "}
              in your color.
            </p>
            <div className="flex gap-1">
              {[50, 200, 400, 600, 700, 800, 950].map((k) => (
                <span key={k} className="h-5 w-5 rounded" style={{ background: shades[k as keyof typeof shades] }} title={String(k)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {hex.toLowerCase() !== DEFAULT_BRAND ? (
          <button type="button" onClick={() => setHex(DEFAULT_BRAND)} className="text-xs text-slate-500 hover:underline">
            Back to the original blue
          </button>
        ) : null}
        <SubmitButton pendingText="Saving…">Save branding</SubmitButton>
      </div>
    </form>
  );
}

/** "ok" for a PNG, JPG or WebP (by its first bytes), else a plain message saying what the file is. */
async function sniffImage(f: File): Promise<string> {
  const b = new Uint8Array(await f.slice(0, 32).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "ok";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "ok";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "ok";
  const name = f.name.toLowerCase();
  const head = ascii(0, 32).toLowerCase();
  const save = "Open it and save (or export) it as a PNG or JPG, then try again.";
  if (head.includes("<svg") || head.includes("<?xml") || name.endsWith(".svg")) return `That's an SVG file, which can't be used for safety reasons. ${save}`;
  if (ascii(0, 3) === "GIF") return `That's a GIF. ${save}`;
  if (ascii(0, 2) === "BM") return `That's a BMP image. ${save}`;
  if (ascii(4, 8) === "ftyp") return `That's an iPhone-style photo (HEIC/AVIF). ${save}`;
  if (ascii(0, 4) === "%PDF") return `That's a PDF. ${save}`;
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return `That's an icon (.ico) file. ${save}`;
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return `That's a TIFF image. ${save}`;
  return `“${f.name}” isn't a PNG, JPG or WebP image. ${save}`;
}
