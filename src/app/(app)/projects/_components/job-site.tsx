"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { buttonClasses, Card, CardBody, CardHeader } from "@/components/ui";
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
}: {
  site: { lat: number; lng: number; from: string | null } | null;
  hasAddress: boolean;
  set: (spot: { lat: number; lng: number } | "address") => Promise<{ ok: true } | { ok: false; error: string }>;
  pin: { id: string; name: string; address: string };
  move: MovePin;
  /** Near the company's other jobs: where the map looks first for a job not on it yet. */
  near?: { lat: number; lng: number };
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

  return (
    <Card>
      <CardHeader title="Job site on the map" description="The time clock flags punches that aren't at the job (Settings → Time clock sets how far counts)." />
      <CardBody className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <MapPin className={cn("h-4 w-4 shrink-0", site ? "text-blue-600" : "text-slate-300")} />
          {site ? (
            <span>
              {site.from === "PHONE" ? "Set from a phone at the site." : site.from === "MAP" ? "Moved on the map." : "Found from the address."}{" "}
              <a href={`https://www.google.com/maps?q=${site.lat},${site.lng}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">
                See it on a map
              </a>
            </span>
          ) : hasAddress ? (
            "The address wasn't found on the map — tap the map where the job is, or stand at the site and use where you are."
          ) : (
            "No address yet — add one above, tap the map where the job is, or stand at the site and use where you are."
          )}
        </p>
        {site ? <JobsMap pins={[{ ...pin, lat: site.lat, lng: site.lng }]} className="h-64" move={move} /> : <JobsMap pins={[]} className="h-64" move={move} place={pin.id} center={near} />}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClasses("secondary", "sm")} disabled={busy} onClick={here}>
            <LocateFixed className="h-3.5 w-3.5" /> Use where I&apos;m standing
          </button>
          {hasAddress ? (
            <button type="button" className={buttonClasses("ghost", "sm")} disabled={busy} onClick={lookUp}>
              <Search className="h-3.5 w-3.5" /> Look up the address again
            </button>
          ) : null}
          {msg ? <span className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span> : null}
        </div>
      </CardBody>
    </Card>
  );
}
