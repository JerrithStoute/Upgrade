"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobsMap, type MovePin } from "@/components/maps/jobs-map";

/**
 * The job's spot on the map — the time clock flags punches that are off site. Found from the
 * address by itself; for one the map can't find (new subdivision, rural route), stand at the site
 * and use where the phone is.
 */
export function JobSite({
  site,
  hasAddress,
  set,
  pin,
  move,
  near,
  extra,
}: {
  site: { lat: number; lng: number; from: string | null } | null;
  hasAddress: boolean;
  set: (spot: { lat: number; lng: number } | "address") => Promise<{ ok: true } | { ok: false; error: string }>;
  pin: { id: string; name: string; address: string };
  move: MovePin;
  /** Near the company's other jobs: where the map looks first for a job not on it yet. */
  near?: { lat: number; lng: number };
  /** Beside the title (Directions). */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = (r: { ok: true } | { ok: false; error: string }, ok: string) => {
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };
  const here = () => {
    setMsg(null);
    if (!navigator.geolocation) return setMsg({ ok: false, text: "This device can't share where it is." });
    navigator.geolocation.getCurrentPosition(
      (p) => start(async () => done(await set({ lat: p.coords.latitude, lng: p.coords.longitude }), "Set to where you're standing.")),
      () => setMsg({ ok: false, text: "Location wasn't shared — allow it for this site in the browser and try again." }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const lookUp = () => {
    setMsg(null);
    start(async () => done(await set("address"), "Found from the address."));
  };

  const small = "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium disabled:opacity-50";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">Job site</h2>
        {extra}
      </header>
      <div className="space-y-2 px-4 py-2.5">
        {site ? <JobsMap pins={[{ ...pin, lat: site.lat, lng: site.lng }]} className="h-56" move={move} /> : <JobsMap pins={[]} className="h-56" move={move} place={pin.id} center={near} />}
        <p className="flex items-start gap-1.5 text-xs text-slate-600">
          <MapPin className={cn("mt-px h-3.5 w-3.5 shrink-0", site ? "text-blue-600" : "text-slate-300")} />
          {site ? (
            <span>
              {pin.address ? `${pin.address} · ` : ""}
              {site.from === "PHONE" ? "set from a phone at the site" : site.from === "MAP" ? "moved on the map" : "found from the address"}. Click the pin to move it.
            </span>
          ) : hasAddress ? (
            "The address wasn't found on the map — tap the map where the job is, or stand at the site and use where you are."
          ) : (
            "No address yet — add one under Details, tap the map where the job is, or stand at the site and use where you are."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={cn(small, "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50")} disabled={busy} onClick={here}>
            <LocateFixed className="h-3.5 w-3.5" /> Use where I&apos;m standing
          </button>
          {hasAddress ? (
            <button type="button" className={cn(small, "text-slate-600 hover:bg-slate-100")} disabled={busy} onClick={lookUp}>
              <Search className="h-3.5 w-3.5" /> Look up the address again
            </button>
          ) : null}
          {msg ? <span className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span> : null}
        </div>
        <p className="text-xs text-slate-400">The time clock flags punches that aren&apos;t at the job (Settings → Time clock sets how far counts).</p>
      </div>
    </section>
  );
}
