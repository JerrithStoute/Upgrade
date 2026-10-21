import { findRoom, prepareRoomFind, type RoomFindOptions, type RoomFindResult } from "@/lib/room-detect";
import type { Pt } from "@/lib/wall-detect";
import type { RoomJob } from "./room-worker";

type SheetData = { segments: Float32Array; fills: RoomFindOptions["fills"]; doors: RoomFindOptions["doors"] };
type Job =
  | { type: "prepare"; id: number; key: string; unitsPerFoot: number; done: (readable: boolean) => void }
  | { type: "find"; id: number; key: string; click: Pt; unitsPerFoot: number; done: (r: RoomFindResult) => void };

// How long a job may run in the worker before it's stopped: well past the room finder's own limits (2½ s a
// click, 8 s reading a sheet ahead), so this only ever catches a sheet the room finder's own clock missed.
const HARD_STOP_MS = { find: 6_000, prepare: 12_000 };

/**
 * Find area off the page, in a background worker: the page keeps answering however long a plan takes,
 * and a job that runs far past its time is stopped (the worker with it) and its sheet called unreadable.
 * Falls back to the page itself where workers aren't available.
 */
export class RoomFinder {
  private worker: Worker | null = null;
  private noWorker = false;
  private keys = new WeakMap<Float32Array, string>();
  private sheets = new Map<string, SheetData>();
  private sent = new Set<string>();
  private jobs = new Map<number, Job>();
  private nextId = 1;
  private unreadable = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** This sheet's key (the same line work → the same key), sent to the worker once. */
  sheet(segments: Float32Array, fills: SheetData["fills"], doors: SheetData["doors"]): string {
    let key = this.keys.get(segments);
    if (!key) {
      key = `s${this.nextId++}`;
      this.keys.set(segments, key);
    }
    this.sheets.set(key, { segments, fills, doors });
    // (Only the last few: the worker keeps 4.)
    while (this.sheets.size > 4) this.sheets.delete(this.sheets.keys().next().value!);
    return key;
  }

  /** Reads a sheet ahead of the first click; false when it can't be read. */
  prepare(key: string, unitsPerFoot: number): Promise<boolean> {
    if (this.unreadable.has(key)) return Promise.resolve(false);
    return new Promise((done) => this.run({ type: "prepare", id: this.nextId++, key, unitsPerFoot, done }));
  }

  /** The room around `click` on this sheet. */
  find(key: string, click: Pt, unitsPerFoot: number): Promise<RoomFindResult> {
    if (this.unreadable.has(key)) return Promise.resolve({ ok: false, reason: "unreadable" });
    return new Promise((done) => this.run({ type: "find", id: this.nextId++, key, click, unitsPerFoot, done }));
  }

  dispose() {
    this.stopWorker();
    this.jobs.clear();
  }

  private run(job: Job) {
    const w = this.ensureWorker();
    if (!w) return this.runHere(job);
    this.jobs.set(job.id, job);
    this.post(w, job);
  }

  /** No worker: on the page itself (the room finder's own clock still stops it at its limit). */
  private runHere(job: Job) {
    const s = this.sheets.get(job.key);
    setTimeout(() => {
      if (job.type === "prepare") job.done(s ? prepareRoomFind(s.segments, { unitsPerFoot: job.unitsPerFoot, fills: s.fills }) : true);
      else job.done(s ? findRoom(s.segments, job.click, { unitsPerFoot: job.unitsPerFoot, fills: s.fills, doors: s.doors }) : { ok: false, reason: "too-small" });
    }, 0);
  }

  private post(w: Worker, job: Job) {
    const s = this.sheets.get(job.key);
    if (s && !this.sent.has(job.key)) {
      w.postMessage({ type: "sheet", key: job.key, ...s } satisfies RoomJob);
      this.sent.add(job.key);
    }
    if (job.type === "prepare") w.postMessage({ type: "prepare", id: job.id, key: job.key, unitsPerFoot: job.unitsPerFoot } satisfies RoomJob);
    else w.postMessage({ type: "find", id: job.id, key: job.key, click: job.click, unitsPerFoot: job.unitsPerFoot } satisfies RoomJob);
  }

  private ensureWorker(): Worker | null {
    if (this.worker || this.noWorker) return this.worker;
    try {
      const w = new Worker(new URL("./room-worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; started?: boolean; readable?: boolean; result?: RoomFindResult; error?: string }>) => this.onMessage(e.data);
      w.onerror = () => {
        // The worker itself broke: whatever was waiting runs on the page instead.
        this.stopWorker();
        this.noWorker = true;
        const waiting = [...this.jobs.values()];
        this.jobs.clear();
        for (const j of waiting) this.runHere(j);
      };
      this.worker = w;
      this.sent.clear();
    } catch {
      this.noWorker = true;
    }
    return this.worker;
  }

  private onMessage(m: { id: number; started?: boolean; readable?: boolean; result?: RoomFindResult; error?: string }) {
    const job = this.jobs.get(m.id);
    if (!job) return;
    if (m.started) {
      this.clearTimer();
      this.timer = setTimeout(() => this.tooLong(job), HARD_STOP_MS[job.type]);
      return;
    }
    this.clearTimer();
    this.jobs.delete(m.id);
    if (job.type === "prepare") {
      if (m.readable === false) this.unreadable.add(job.key);
      job.done(m.readable !== false);
    } else {
      const r: RoomFindResult = m.result ?? { ok: false, reason: "unreadable" };
      if (!r.ok && r.reason === "unreadable") this.unreadable.add(job.key);
      job.done(r);
    }
  }

  /** A job ran far past its time: the worker is stopped, that sheet is unreadable, the rest start again. */
  private tooLong(job: Job) {
    this.timer = null;
    this.unreadable.add(job.key);
    this.stopWorker();
    const waiting = [...this.jobs.values()];
    this.jobs.clear();
    for (const j of waiting) {
      if (j.key === job.key) {
        if (j.type === "prepare") j.done(false);
        else j.done({ ok: false, reason: "unreadable" });
      } else this.run(j);
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private stopWorker() {
    this.clearTimer();
    this.worker?.terminate();
    this.worker = null;
    this.sent.clear();
  }
}
