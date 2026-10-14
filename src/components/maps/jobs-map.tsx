"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
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

/**
 * Street map tiles. OpenStreetMap's own servers: free, no account, fine for a builder's handful of
 * maps a day. If the program outgrows that, this one line points at a paid tile service instead.
 */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * A map of one job or many: a pin each, zoom and drag, and a popup with the address, Directions
 * (from where you are, in your maps app) and — for the team — a link to the job.
 */
export function JobsMap({ pins, className = "h-80" }: { pins: MapPin[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const apple = useApple();
  const key = JSON.stringify(pins.map((p) => [p.id, p.lat, p.lng, p.color]));

  useEffect(() => {
    let gone = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (gone || !box.current) return;
      map.current?.remove();
      const m = L.map(box.current, { scrollWheelZoom: false, attributionControl: true });
      map.current = m;
      L.tileLayer(TILES, { maxZoom: 19, attribution: CREDIT }).addTo(m);
      for (const p of pins) {
        const popup = `<div style="min-width:180px">
          <p style="margin:0;font-weight:600;color:#0f172a">${esc(p.name)}</p>
          <p style="margin:2px 0 8px;color:#475569">${esc(p.address || "—")}</p>
          <a href="${esc(directionsUrl(p, apple))}" target="_blank" rel="noopener noreferrer" style="font-weight:600;color:#1d4ed8">Directions</a>
          ${p.href ? ` · <a href="${esc(p.href)}" style="color:#1d4ed8">Open the job</a>` : ""}
        </div>`;
        L.circleMarker([p.lat, p.lng], { radius: 9, color: "#fff", weight: 2, fillColor: p.color ?? "#1d4ed8", fillOpacity: 1 })
          .addTo(m)
          .bindPopup(popup)
          .bindTooltip(p.name);
      }
      if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], 16);
      else if (pins.length) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
      else m.setView([39.5, -98.35], 4); // the whole country until there's a pin
    })();
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
    };
    // Redrawn when the pins change (key), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, apple]);

  return <div ref={box} className={`z-0 w-full overflow-hidden rounded-lg border border-slate-200 ${className}`} role="region" aria-label="Map" />;
}
