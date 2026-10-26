"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { Move } from "lucide-react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui";
import { directionsUrl, useApple } from "./directions";

export type MapPin = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Pin color (a job's status). */
  color?: string;
  /** "Open the job" link (staff); left out in the vendor portal. */
  href?: string;
};

/** Saves a pin's new spot (a job's site): moved on the map, or put back (Undo). */
export type MovePin = (id: string, spot: { lat: number; lng: number }) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Map tiles. Street: OpenStreetMap's own servers. Satellite: Esri's World Imagery, with roads and place
 * names laid over it. Both free with no account — fine for a builder's handful of maps a day. If the
 * program outgrows that, these lines point at a paid tile service instead (GOING-ONLINE.md).
 */
const STREET = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREET_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const SATELLITE = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const SAT_ROADS = `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`;
const SAT_NAMES = `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`;
const SAT_CREDIT = "Imagery &copy; Esri, Maxar, Earthstar Geographics";
/** Map or Satellite: each person's last pick, on this device. */
const LOOK = "bs-map-look";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const dot = (color: string, moving = false) =>
  `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${moving ? "3px #f59e0b" : "1px rgba(15,23,42,.35)"}"></span>`;

/**
 * A map of one job or many: a pin each, zoom and drag, Map or Satellite, and a popup with the address,
 * Directions (from where you are, in your maps app) and — for the team — a link to the job. With `move`
 * (the team), a pin that's in the wrong spot can be moved: **Move pin**, then drag it (or tap the map)
 * where the job is. It's saved at once; Undo puts it back.
 */
export function JobsMap({
  pins,
  className = "h-80",
  move,
  place: placing,
  center,
}: {
  pins: MapPin[];
  className?: string;
  move?: MovePin;
  /** A job not on the map yet: tap the map to put its pin there (with `move`). */
  place?: string;
  /** Where to look first when there's no pin (near the company's other jobs). */
  center?: { lat: number; lng: number };
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const apple = useApple();
  const router = useRouter();
  const key = JSON.stringify(pins.map((p) => [p.id, p.lat, p.lng, p.color]));
  // The pin being moved, and the spot it had before the last move (for Undo).
  const [moving, setMoving] = useState<string | null>(placing ?? null);
  const [undo, setUndo] = useState<{ id: string; lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const movingRef = useRef<string | null>(null);
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  }, [move]);
  const startMoving = (id: string | null) => {
    setMsg(null);
    setMoving(id);
  };

  const place = async (id: string, lat: number, lng: number, isUndo = false, before?: { lat: number; lng: number }) => {
    const m = markers.current.get(id);
    const was = before ?? (m ? m.getLatLng() : null);
    m?.setLatLng([lat, lng]);
    const r = await moveRef.current!(id, { lat, lng });
    if (!r.ok) {
      if (was) m?.setLatLng(was);
      setMsg({ ok: false, text: r.error });
      return;
    }
    setMsg({ ok: true, text: isUndo ? "Put back." : "Saved — the job's spot (and the time clock's) is here now." });
    setUndo(isUndo || !was ? null : { id, lat: was.lat, lng: was.lng });
    router.refresh();
  };

  useEffect(() => {
    let gone = false;
    const all = markers.current;
    (async () => {
      const L = (await import("leaflet")).default;
      if (gone || !box.current) return;
      map.current?.remove();
      markers.current.clear();
      const m = L.map(box.current, { scrollWheelZoom: false, attributionControl: true });
      map.current = m;
      const street = L.tileLayer(STREET, { maxZoom: 19, attribution: STREET_CREDIT });
      const satellite = L.layerGroup([
        L.tileLayer(SATELLITE, { maxZoom: 19, attribution: SAT_CREDIT }),
        L.tileLayer(SAT_ROADS, { maxZoom: 19 }),
        L.tileLayer(SAT_NAMES, { maxZoom: 19 }),
      ]);
      let look: string | null = null;
      try {
        look = localStorage.getItem(LOOK);
      } catch {
        /* no storage: street map */
      }
      (look === "Satellite" ? satellite : street).addTo(m);
      L.control.layers({ Map: street, Satellite: satellite }, undefined, { position: "topright", collapsed: false }).addTo(m);
      m.on("baselayerchange", (e) => {
        try {
          localStorage.setItem(LOOK, e.name);
        } catch {
          /* not remembered */
        }
      });

      for (const p of pins) {
        const popup = `<div style="min-width:180px">
          <p style="margin:0;font-weight:600;color:#0f172a">${esc(p.name)}</p>
          <p style="margin:2px 0 8px;color:#475569">${esc(p.address || "—")}</p>
          <a href="${esc(directionsUrl(p, apple))}" target="_blank" rel="noopener noreferrer" style="font-weight:600;color:#1d4ed8">Directions</a>
          ${p.href ? ` · <a href="${esc(p.href)}" style="color:#1d4ed8">Open the job</a>` : ""}
          ${moveRef.current ? ` · <button type="button" data-move="${esc(p.id)}" style="color:#1d4ed8;background:none;border:0;padding:0;cursor:pointer;font:inherit">Move pin</button>` : ""}
        </div>`;
        const color = p.color ?? "#1d4ed8";
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: dot(color, movingRef.current === p.id), className: "", iconSize: [18, 18], iconAnchor: [9, 9] }),
          draggable: movingRef.current === p.id,
          keyboard: false,
        })
          .addTo(m)
          .bindPopup(popup)
          .bindTooltip(p.name);
        let from: { lat: number; lng: number } | null = null;
        marker.on("dragstart", () => (from = marker.getLatLng()));
        marker.on("dragend", () => {
          const at = marker.getLatLng();
          void place(p.id, at.lat, at.lng, false, from ?? undefined);
        });
        markers.current.set(p.id, marker);
      }
      // "Move pin" in a popup.
      m.on("popupopen", (e) => {
        const b = e.popup.getElement()?.querySelector<HTMLButtonElement>("[data-move]");
        b?.addEventListener("click", () => {
          m.closePopup();
          startMoving(b.dataset.move!);
        });
      });
      // While moving: a tap on the map puts the pin there.
      m.on("click", (e) => {
        const id = movingRef.current;
        if (id) void place(id, e.latlng.lat, e.latlng.lng);
      });

      if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], 16);
      else if (pins.length) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
      else if (center) m.setView([center.lat, center.lng], 12);
      else m.setView([39.5, -98.35], 4); // the whole country until there's a pin
    })();
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
      all.clear();
    };
    // Redrawn when the pins change (key), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, apple]);

  // The pin being moved: draggable, ringed in amber; every other pin as it was.
  useEffect(() => {
    movingRef.current = moving;
    for (const [id, mk] of markers.current) {
      const p = pins.find((x) => x.id === id);
      const on = id === moving;
      if (on) mk.dragging?.enable();
      else mk.dragging?.disable();
      const el = mk.getElement();
      if (el && p) el.innerHTML = dot(p.color ?? "#1d4ed8", on);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, key]);

  const movingPin = pins.find((p) => p.id === moving);
  return (
    <div className="space-y-1.5">
      {move && (moving || pins.length === 1 || msg) ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {movingPin ? (
            <>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900 ring-1 ring-amber-200">
                Drag <b>{movingPin.name}</b>&apos;s pin — or tap the map — where the job is. Satellite helps.
              </span>
              <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => startMoving(null)}>
                Done
              </button>
            </>
          ) : moving && placing === moving ? (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900 ring-1 ring-amber-200">Zoom in and tap the map where the job is. Satellite helps.</span>
          ) : pins.length === 1 ? (
            <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => startMoving(pins[0].id)}>
              <Move className="h-3.5 w-3.5" /> Move pin
            </button>
          ) : null}
          {msg ? <span className={msg.ok ? "text-emerald-700" : "text-rose-700"}>{msg.text}</span> : null}
          {undo ? (
            <button
              type="button"
              className="font-medium text-blue-700 hover:underline"
              onClick={() => {
                const u = undo;
                setUndo(null);
                void place(u.id, u.lat, u.lng, true);
              }}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={box} className={`z-0 w-full overflow-hidden rounded-lg border border-slate-200 ${className}`} role="region" aria-label="Map" />
    </div>
  );
}
