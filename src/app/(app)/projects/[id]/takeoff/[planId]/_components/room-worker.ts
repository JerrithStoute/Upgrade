/// <reference lib="webworker" />
// Find area runs here, off the page: however a plan is drawn, the page never stops answering while a room is
// worked out (room-find.ts sends the jobs, and stops this worker if one runs far past its time).
import { findRoom, prepareRoomFind, type RoomFindOptions } from "@/lib/room-detect";
import type { Pt } from "@/lib/wall-detect";

type Sheet = { segments: Float32Array; fills: RoomFindOptions["fills"]; doors: RoomFindOptions["doors"] };
export type RoomJob =
  | { type: "sheet"; key: string; segments: Float32Array; fills: RoomFindOptions["fills"]; doors: RoomFindOptions["doors"] }
  | { type: "prepare"; id: number; key: string; unitsPerFoot: number }
  | { type: "find"; id: number; key: string; click: Pt; unitsPerFoot: number };

// The last few sheets (the same arrays each time, so what was read ahead is kept for the clicks).
const sheets = new Map<string, Sheet>();

self.onmessage = (e: MessageEvent<RoomJob>) => {
  const job = e.data;
  if (job.type === "sheet") {
    sheets.delete(job.key);
    sheets.set(job.key, { segments: job.segments, fills: job.fills, doors: job.doors });
    while (sheets.size > 4) sheets.delete(sheets.keys().next().value!);
    return;
  }
  self.postMessage({ id: job.id, started: true });
  const sheet = sheets.get(job.key);
  try {
    if (job.type === "prepare") {
      const readable = sheet ? prepareRoomFind(sheet.segments, { unitsPerFoot: job.unitsPerFoot, fills: sheet.fills }) : true;
      self.postMessage({ id: job.id, readable });
    } else {
      const result = sheet ? findRoom(sheet.segments, job.click, { unitsPerFoot: job.unitsPerFoot, fills: sheet.fills, doors: sheet.doors }) : { ok: false, reason: "too-small" };
      self.postMessage({ id: job.id, result });
    }
  } catch (err) {
    self.postMessage({ id: job.id, error: err instanceof Error ? err.message : "Find area failed" });
  }
};
