"use client";

import { useSyncExternalStore } from "react";
import { Navigation } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Directions to a job from wherever the person is: the phone's own maps app does it (it knows where
 * they are, and talks them there). iPhones get Apple Maps; everything else Google Maps (the app on
 * Android, a new tab on a computer).
 */
export function directionsUrl(to: { lat: number | null; lng: number | null; address: string }, apple: boolean) {
  const dest = to.lat != null && to.lng != null ? `${to.lat},${to.lng}` : to.address;
  return apple ? `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;

export function useApple() {
  return useSyncExternalStore(
    () => () => {},
    isApple,
    () => false,
  );
}

/** The Directions button (or a small link). Nothing when there's neither a spot nor an address. */
export function Directions({ to, small, className }: { to: { lat: number | null; lng: number | null; address: string }; small?: boolean; className?: string }) {
  const apple = useApple();
  if (to.lat == null && !to.address.trim()) return null;
  return (
    <a
      href={directionsUrl(to, apple)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(small ? "inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" : buttonClasses("secondary", "sm"), className)}
      title="Directions from where you are — opens your maps app"
    >
      <Navigation className={small ? "h-3 w-3" : "h-3.5 w-3.5"} /> Directions
    </a>
  );
}
