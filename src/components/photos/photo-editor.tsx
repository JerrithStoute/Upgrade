"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Circle, Crop, Loader2, MoveUpRight, Pencil, RotateCw, Type, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fit, openPicture, toJpeg } from "./prepare";

type Pt = [number, number];
type Mark =
  | { kind: "pen"; pts: Pt[]; color: string }
  | { kind: "arrow"; a: Pt; b: Pt; color: string }
  | { kind: "circle"; a: Pt; b: Pt; color: string }
  | { kind: "text"; at: Pt; text: string; color: string };
type Tool = "pen" | "arrow" | "circle" | "text" | "crop";
/** One step back: a mark drawn, or the photo turned or cropped (with the marks it had then). */
type Step = { kind: "mark" } | { kind: "photo"; base: HTMLCanvasElement; marks: Mark[] };

const COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Yellow", value: "#facc15" },
  { name: "Blue", value: "#3b82f6" },
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#0f172a" },
];
const TOOLS: { tool: Tool; label: string; icon: typeof Pencil }[] = [
  { tool: "pen", label: "Draw", icon: Pencil },
  { tool: "arrow", label: "Arrow", icon: MoveUpRight },
  { tool: "circle", label: "Circle", icon: Circle },
  { tool: "text", label: "Text", icon: Type },
  { tool: "crop", label: "Crop", icon: Crop },
];

/** Line width and lettering, from the photo's size — so marks look the same on any photo. */
const sizes = (c: HTMLCanvasElement) => {
  const long = Math.max(c.width, c.height);
  return { line: Math.max(3, long / 220), text: Math.max(16, long / 26) };
};

function drawMark(ctx: CanvasRenderingContext2D, m: Mark, s: { line: number; text: number }) {
  ctx.strokeStyle = m.color;
  ctx.fillStyle = m.color;
  ctx.lineWidth = s.line;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (m.kind === "pen") {
    ctx.beginPath();
    m.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (m.pts.length === 1) ctx.lineTo(m.pts[0][0] + 0.1, m.pts[0][1]);
    ctx.stroke();
  } else if (m.kind === "arrow") {
    const [[x1, y1], [x2, y2]] = [m.a, m.b];
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = s.line * 4.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  } else if (m.kind === "circle") {
    const [cx, cy] = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2];
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, Math.abs(m.b[0] - m.a[0]) / 2), Math.max(1, Math.abs(m.b[1] - m.a[1]) / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // (Outlined in the opposite shade, so it reads on any background.)
    ctx.font = `600 ${s.text}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = s.text / 7;
    ctx.strokeStyle = m.color === "#0f172a" ? "#ffffff" : "#0f172a";
    ctx.strokeText(m.text, m.at[0], m.at[1]);
    ctx.fillText(m.text, m.at[0], m.at[1]);
  }
}

/** The photo with its marks drawn in, as one picture. */
function flatten(base: HTMLCanvasElement, marks: Mark[]) {
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  const s = sizes(base);
  for (const m of marks) drawMark(ctx, m, s);
  return c;
}

/**
 * Mark up a photo before it's uploaded — on a phone, full screen: draw, arrows, circles and typed
 * notes in a few colors, crop, turn it; Undo; Save. What's saved is a JPG (`Save` hands it back; the
 * original isn't kept). Cancel leaves the photo as it was.
 */
export function PhotoEditor({ file, onSave, onCancel }: { file: File; onSave: (edited: File) => void; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const marks = useRef<Mark[]>([]);
  const steps = useRef<Step[]>([]);
  const draft = useRef<Mark | null>(null);
  const cropRect = useRef<{ a: Pt; b: Pt } | null>(null);
  const view = useRef({ k: 1, x: 0, y: 0 });
  const [ready, setReady] = useState<"loading" | "ok" | "failed">("loading");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [canUndo, setCanUndo] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const draw = useCallback(() => {
    const c = canvas.current;
    const b = base.current;
    const el = box.current;
    if (!c || !b || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const [cw, ch] = [el.clientWidth, el.clientHeight];
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const k = Math.min(cw / b.width, ch / b.height);
    view.current = { k, x: (cw - b.width * k) / 2, y: (ch - b.height * k) / 2 };
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, view.current.x * dpr, view.current.y * dpr);
    ctx.drawImage(b, 0, 0);
    const s = sizes(b);
    for (const m of marks.current) drawMark(ctx, m, s);
    if (draft.current) drawMark(ctx, draft.current, s);
    const r = cropRect.current;
    if (r) {
      const [x0, y0, x1, y1] = [Math.min(r.a[0], r.b[0]), Math.min(r.a[1], r.b[1]), Math.max(r.a[0], r.b[0]), Math.max(r.a[1], r.b[1])];
      // Outside the crop darkened; the crop outlined.
      ctx.fillStyle = "rgba(2,6,23,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, b.width, b.height);
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.fill("evenodd");
      ctx.setLineDash([s.line * 2, s.line * 2]);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = s.line / 1.5;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
  }, []);

  // The photo, opened at the size it'll be saved.
  useEffect(() => {
    let gone = false;
    openPicture(file)
      .then((img) => {
        if (gone) return;
        const [w, h] = fit(img.naturalWidth, img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        base.current = c;
        setReady("ok");
      })
      .catch(() => !gone && setReady("failed"));
    return () => {
      gone = true;
    };
  }, [file]);

  useEffect(() => {
    if (ready !== "ok" || !box.current) return;
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [ready, draw]);

  // No page scrolling behind it; Escape cancels.
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && !saving && onCancel();
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = was;
      window.removeEventListener("keydown", key);
    };
  }, [onCancel, saving]);

  const at = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    const b = base.current!;
    const { k, x, y } = view.current;
    const px = (e.clientX - r.left - x) / k;
    const py = (e.clientY - r.top - y) / k;
    return [Math.min(b.width, Math.max(0, px)), Math.min(b.height, Math.max(0, py))];
  };

  const addMark = (m: Mark) => {
    marks.current = [...marks.current, m];
    steps.current.push({ kind: "mark" });
    setCanUndo(true);
  };

  /** The photo itself changed (turned, cropped): the marks drawn in, so Undo can put both back. */
  const newPhoto = (next: HTMLCanvasElement) => {
    steps.current.push({ kind: "photo", base: base.current!, marks: marks.current });
    base.current = next;
    marks.current = [];
    setCanUndo(true);
    draw();
  };

  const down = (e: React.PointerEvent) => {
    if (ready !== "ok" || saving) return;
    const p = at(e);
    if (tool === "text") {
      setTextAt(p);
      setText("");
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    if (tool === "crop") {
      cropRect.current = { a: p, b: p };
      setCropping(false);
    } else draft.current = tool === "pen" ? { kind: "pen", pts: [p], color } : { kind: tool, a: p, b: p, color };
    draw();
  };
  const follow = (e: React.PointerEvent) => {
    const p = at(e);
    const d = draft.current;
    if (tool === "crop" && cropRect.current) cropRect.current = { ...cropRect.current, b: p };
    else if (d?.kind === "pen") d.pts.push(p);
    else if (d && d.kind !== "text") d.b = p;
  };
  const move = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    follow(e);
    draw();
  };
  const up = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // (Where the finger came off: the last move isn't always reported.)
    if (e.type === "pointerup") follow(e);
    const b = base.current!;
    const tiny = Math.max(b.width, b.height) / 100;
    const r = cropRect.current;
    if (tool === "crop" && r) {
      if (Math.abs(r.b[0] - r.a[0]) > tiny && Math.abs(r.b[1] - r.a[1]) > tiny) setCropping(true);
      else cropRect.current = null;
    }
    const d = draft.current;
    draft.current = null;
    // (A tap with the arrow or circle draws nothing.)
    if (d && (d.kind === "pen" || (d.kind !== "text" && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) > tiny))) addMark(d);
    draw();
  };

  const placeText = () => {
    const t = text.trim();
    if (t && textAt) addMark({ kind: "text", at: textAt, text: t, color });
    setTextAt(null);
    setText("");
    draw();
  };

  const undo = () => {
    const last = steps.current.pop();
    if (last?.kind === "mark") marks.current = marks.current.slice(0, -1);
    else if (last?.kind === "photo") {
      base.current = last.base;
      marks.current = last.marks;
    }
    setCanUndo(steps.current.length > 0);
    draw();
  };

  const rotate = () => {
    const flat = flatten(base.current!, marks.current);
    const c = document.createElement("canvas");
    c.width = flat.height;
    c.height = flat.width;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(flat, 0, 0);
    cropRect.current = null;
    setCropping(false);
    newPhoto(c);
  };

  const applyCrop = () => {
    const r = cropRect.current;
    if (!r) return;
    const flat = flatten(base.current!, marks.current);
    const [x0, y0] = [Math.round(Math.min(r.a[0], r.b[0])), Math.round(Math.min(r.a[1], r.b[1]))];
    const [w, h] = [Math.round(Math.abs(r.b[0] - r.a[0])), Math.round(Math.abs(r.b[1] - r.a[1]))];
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(flat, x0, y0, w, h, 0, 0, w, h);
    cropRect.current = null;
    setCropping(false);
    setTool("pen");
    newPhoto(c);
  };
  const cancelCrop = () => {
    cropRect.current = null;
    setCropping(false);
    draw();
  };

  const save = async () => {
    if (!base.current) return;
    setSaving(true);
    try {
      onSave(await toJpeg(flatten(base.current, marks.current), file.name));
    } catch {
      setSaving(false);
    }
  };

  const pick = (t: Tool) => {
    if (t !== "crop") cancelCrop();
    setTextAt(null);
    setTool(t);
  };

  const iconBtn = "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label="Mark up photo">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="rounded-md px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm text-slate-400">{file.name}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-40"
          onClick={undo}
          disabled={!canUndo || saving}
        >
          <Undo2 className="h-4 w-4" /> Undo
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          onClick={() => void save()}
          disabled={ready !== "ok" || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
        </button>
      </div>

      <div ref={box} className="relative min-h-0 flex-1">
        {ready === "loading" ? <p className="absolute inset-0 grid place-items-center text-sm text-slate-400">Opening the photo…</p> : null}
        {ready === "failed" ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">
            This browser can&apos;t open this photo to mark it up (an iPhone HEIC photo on a PC can&apos;t be). It will upload as it is.
          </p>
        ) : null}
        <canvas
          ref={canvas}
          className={cn("absolute inset-0 h-full w-full touch-none", tool === "text" ? "cursor-text" : "cursor-crosshair")}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {textAt ? (
          <form
            className="absolute inset-x-3 top-3 flex gap-2 rounded-lg bg-slate-900/95 p-2 shadow-lg ring-1 ring-white/10"
            onSubmit={(e) => {
              e.preventDefault();
              placeText();
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type the note"
              maxLength={120}
              className="min-w-0 flex-1 rounded-md bg-white px-3 py-2 text-base text-slate-900"
              aria-label="Note on the photo"
            />
            <button type="submit" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold">
              Add
            </button>
            <button type="button" className="rounded-md px-2 py-2 text-slate-300" aria-label="Don't add a note" onClick={() => setTextAt(null)}>
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : null}
        {cropping ? (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            <button type="button" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold shadow" onClick={applyCrop}>
              Crop to this
            </button>
            <button type="button" className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium shadow" onClick={cancelCrop}>
              Never mind
            </button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <p className="text-center text-xs text-slate-400">
          {tool === "text"
            ? "Tap where the note goes."
            : tool === "crop"
              ? "Drag a box around what to keep."
              : tool === "pen"
                ? "Draw with your finger (or mouse)."
                : `Drag to draw ${tool === "arrow" ? "an arrow — it points where you let go" : "a circle"}.`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {TOOLS.map(({ tool: t, label, icon: Icon }) => (
            <button
              key={t}
              type="button"
              className={cn(iconBtn, tool === t ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10")}
              onClick={() => pick(t)}
              aria-pressed={tool === t}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
          <button type="button" className={cn(iconBtn, "text-slate-300 hover:bg-white/10")} onClick={rotate} disabled={ready !== "ok"}>
            <RotateCw className="h-5 w-5" />
            Turn
          </button>
        </div>
        <div className="flex items-center justify-center gap-3">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={cn("h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-slate-950", color === c.value ? "ring-white" : "ring-transparent")}
              style={{ background: c.value, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.35)" }}
              onClick={() => setColor(c.value)}
              aria-label={c.name}
              aria-pressed={color === c.value}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
