"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crop, HardHat, ImageUp } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { BRAND_PRESETS, DEFAULT_BRAND, brandShades, isHexColor } from "@/lib/brand";
import { ACCENT_PRESETS, BACKGROUND_PRESETS, PLAN_DIM_MAX, accentShades, backgroundAdjusted, screenPalette, usableBackground, type BrandStyle } from "@/lib/brand-style";
import { cn } from "@/lib/utils";
import { saveBranding } from "./actions";
import { LogoEditor } from "./logo-editor";

/**
 * Logo, main color, and the work screens' look (highlight color, menu, Bright / Soft, dimmed plans —
 * brand-style.ts), for the whole company. The preview shows it as the program will before saving.
 */
export function BrandingForm({ color, style, logoUrl, companyName }: { color: string | null; style: BrandStyle; logoUrl: string | null; companyName: string }) {
  const [hex, setHex] = useState(isHexColor(color) ? color : DEFAULT_BRAND);
  const [accent, setAccent] = useState<string | null>(style.accent);
  const [menu, setMenu] = useState(style.menu);
  const [screen, setScreen] = useState(style.screen);
  const [background, setBackground] = useState<string>(style.background ?? BACKGROUND_PRESETS[0].hex);
  const [intensity, setIntensity] = useState(style.intensity);
  const [planDim, setPlanDim] = useState(style.planDim);
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
  // The marker color as it will show: the highlight picked, or the main color's own (the logo's yellow out of the box).
  const marker = accent ? accentShades(accent)[400] : shades[400];
  // The screen's colors as picked (null: Bright, the program's own).
  const pal = screenPalette({ ...style, screen, background, intensity });
  const shownLogo = preview ?? (removeLogo ? null : logoUrl);

  return (
    <form action={saveBranding} className="space-y-5">
      <input type="hidden" name="brandColor" value={hex} />
      <input type="hidden" name="accent" value={accent ?? ""} />
      <input type="hidden" name="menu" value={menu} />
      <input type="hidden" name="screen" value={screen} />
      <input type="hidden" name="background" value={screen === "color" ? background : ""} />
      <input type="hidden" name="intensity" value={intensity} />
      <input type="hidden" name="planDim" value={planDim} />
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

      <div>
        <p className="label">Highlight color</p>
        <p className="mb-2 text-xs text-slate-600">The marker on the menu item you&apos;re on, the tab you&apos;re on, and the box you&apos;re typing in.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAccent(null)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", accent === null ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}
            title={hex.toLowerCase() === DEFAULT_BRAND ? "The logo's yellow" : "A lighter shade of your main color"}
          >
            Automatic
          </button>
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={p.name}
              aria-label={p.name}
              onClick={() => setAccent(p.hex)}
              className={cn("grid h-7 w-7 place-items-center rounded-full ring-2 ring-offset-2", accent === p.hex ? "ring-slate-900" : "ring-transparent hover:ring-slate-300")}
              style={{ background: p.hex }}
            >
              {accent === p.hex ? <Check className="h-3.5 w-3.5 text-white" /> : null}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-xs text-slate-600">
            Any color
            <input
              type="color"
              value={accent ?? marker}
              onChange={(e) => setAccent(e.target.value.toLowerCase())}
              className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
              aria-label="Pick any highlight color"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label">Menu</p>
          <div className="flex gap-2">
            {(
              [
                ["light", "Light"],
                ["brand", "In your main color"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMenu(v)}
                className={cn("flex-1 rounded-lg border-2 p-2 text-left text-xs font-medium", menu === v ? "border-slate-900" : "border-slate-200 hover:border-slate-300")}
              >
                <span className="mb-1.5 block h-8 rounded" style={{ background: v === "brand" ? shades[900] : "#ffffff", border: "1px solid #e2e8f0" }} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">Screen</p>
          <div className="flex gap-2">
            {(["bright", "soft", "color"] as const).map((v) => {
              const pal = screenPalette({ ...style, screen: v, background, intensity });
              const label = v === "bright" ? "Bright" : v === "soft" ? "Soft" : "Your color";
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setScreen(v)}
                  className={cn("flex-1 rounded-lg border-2 p-2 text-left text-xs font-medium", screen === v ? "border-slate-900" : "border-slate-200 hover:border-slate-300")}
                >
                  <span className="mb-1.5 flex h-8 items-center rounded px-1.5" style={{ background: pal?.background ?? "#f6f7f9" }}>
                    <span className="h-5 w-full rounded-sm" style={{ background: pal?.white ?? "#ffffff", border: `1px solid ${pal?.slate[200] ?? "#e2e8f0"}` }} />
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
          {screen === "color" ? (
            <div className="mt-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {BACKGROUND_PRESETS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    title={p.name}
                    aria-label={p.name}
                    onClick={() => setBackground(p.hex)}
                    className={cn("h-7 w-7 rounded-full border border-slate-300 ring-2 ring-offset-2", background === p.hex ? "ring-slate-900" : "ring-transparent hover:ring-slate-300")}
                    style={{ background: p.hex }}
                  />
                ))}
                <label className="ml-1 flex items-center gap-2 text-xs text-slate-600">
                  Any color
                  <input
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value.toLowerCase())}
                    className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                    aria-label="Pick any background color"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-700">
                <span className="font-medium">Strength</span>
                <span className="text-slate-500">Faint</span>
                <input type="range" min={0} max={100} step={5} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} aria-label="How strong the background color is" className="w-40" />
                <span className="text-slate-500">Strong</span>
              </div>
              {backgroundAdjusted(background) ? (
                <p className="text-xs text-slate-600">
                  Lightened to <span className="inline-block h-3 w-3 rounded-sm align-middle" style={{ background: usableBackground(background) }} /> so text stays readable.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <p className="label">Plans on the takeoff screen</p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <input type="range" min={0} max={PLAN_DIM_MAX} step={5} value={planDim} onChange={(e) => setPlanDim(Number(e.target.value))} aria-label="Dim plan sheets" className="w-48" />
          <span className="tabular-nums">{planDim ? `Dimmed ${planDim}%` : "Full brightness"}</span>
        </div>
        <p className="mt-1 text-xs text-slate-600">A white plan sheet can glare. Your takeoff lines on top stay full strength; printing isn&apos;t affected.</p>
      </div>

      {/* Preview, drawn with the picked colors */}
      <div className="rounded-lg border border-slate-200 p-4" style={{ background: pal?.background ?? "#f6f7f9" }}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-60 rounded-lg border border-slate-200 p-2" style={{ background: menu === "brand" ? shades[900] : (pal?.white ?? "#ffffff") }}>
            <div className="mb-2 flex items-center gap-2 px-1">
              {shownLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownLogo} alt="" className="max-h-14 max-w-[13rem] object-contain" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-md text-white" style={{ background: shades[700] }}>
                  <HardHat className="h-5 w-5" />
                </span>
              )}
              <span className="truncate text-xs font-semibold" style={{ color: menu === "brand" ? "#ffffff" : "#1e293b" }}>
                {companyName}
              </span>
            </div>
            <div
              className="rounded-md px-2 py-1.5 text-sm font-medium"
              style={{
                background: menu === "brand" ? "rgb(255 255 255 / 0.14)" : shades[50],
                color: menu === "brand" ? "#ffffff" : shades[800],
                boxShadow: `inset 3px 0 0 ${marker}`,
              }}
            >
              Projects
            </div>
            <div className="px-2 py-1.5 text-sm" style={{ color: menu === "brand" ? "rgb(255 255 255 / 0.82)" : "#475569" }}>
              Clients
            </div>
          </div>
          <div className="space-y-3 rounded-lg p-3" style={{ background: pal?.white ?? "#ffffff" }}>
            <span className="block border-b-2 pb-1 text-sm font-medium" style={{ borderColor: marker, color: pal?.slate[900] ?? "#0f172a" }}>
              The tab you&apos;re on
            </span>
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
            Back to Builder Station black
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
