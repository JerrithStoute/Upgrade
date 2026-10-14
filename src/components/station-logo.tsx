import { Saira_Stencil } from "next/font/google";
import { cn } from "@/lib/utils";

/**
 * The Builder Station's own logo (not a builder's — theirs is BrandMark):
 *  - StationIcon: the stencil house, for small squares (menu corner, browser tab, phone icon).
 *  - StationStamp: the crate stamp — THE / BUILDER / STATION in a tilted frame. The main logo.
 *  - StationLine: icon + the name on one line, for the top of the website and narrow spaces.
 * Yellow on black is the logo; `tone="ink"` is the one-color version for light backgrounds.
 */

const stencil = Saira_Stencil({ subsets: ["latin"], display: "swap" });
/** The heavy cut — the logo is never set in the thin ones. */
const HEAVY = 800;

export const STATION_YELLOW = "#fbbf24";
export const STATION_BLACK = "#111827";

/** The stencil house in its black tile. `frame`: the thin yellow edge (leave off at tiny sizes). */
export function StationIcon({ size = 32, frame = size >= 28, className }: { size?: number; frame?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="The Builder Station" className={cn("shrink-0", className)}>
      {frame ? (
        <rect x="1.5" y="1.5" width="61" height="61" rx="13" fill={STATION_BLACK} stroke={STATION_YELLOW} strokeWidth="2.5" />
      ) : (
        <rect width="64" height="64" rx="12" fill={STATION_BLACK} />
      )}
      <path d="M32 10 L56 31 H8 Z" fill={STATION_YELLOW} />
      <rect x="43" y="11" width="6" height="11" fill={STATION_YELLOW} />
      <path d="M13 35 H30 V43 H27 V54 H13 Z M34 35 H51 V54 H37 V43 H34 Z" fill={STATION_YELLOW} />
    </svg>
  );
}

/** The crate stamp. `size`: the height of BUILDER / STATION's letters in px. `tone`: "gold" (on black) or "ink" (one color, on light). */
export function StationStamp({ size = 36, tone = "gold", className }: { size?: number; tone?: "gold" | "ink"; className?: string }) {
  const color = tone === "gold" ? STATION_YELLOW : STATION_BLACK;
  const small = Math.round(size * 0.36);
  return (
    <span
      role="img"
      aria-label="The Builder Station"
      className={cn(stencil.className, "inline-block -rotate-2 text-center leading-none", className)}
      style={{ fontWeight: HEAVY, color, border: `${Math.max(2, Math.round(size / 12))}px solid ${color}`, padding: `${Math.round(size * 0.28)}px ${Math.round(size * 0.6)}px ${Math.round(size * 0.33)}px` }}
    >
      <span aria-hidden className="block" style={{ fontSize: small, letterSpacing: `${Math.round(small * 0.55)}px`, marginRight: -Math.round(small * 0.55), lineHeight: 1.4 }}>
        THE
      </span>
      <span aria-hidden className="block" style={{ fontSize: size, lineHeight: 1.05 }}>
        BUILDER
      </span>
      <span aria-hidden className="block" style={{ fontSize: size, lineHeight: 1.05 }}>
        STATION
      </span>
    </span>
  );
}

/** Icon + the name on one line. `tone`: "ink" (dark letters, for light bars) or "gold" (on black). */
export function StationLine({ size = 32, tone = "ink", hideNameOnPhones, className }: { size?: number; tone?: "gold" | "ink"; hideNameOnPhones?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <StationIcon size={size} />
      <span
        aria-hidden
        className={cn(stencil.className, "whitespace-nowrap leading-none", hideNameOnPhones && "hidden sm:inline")}
        style={{ fontWeight: HEAVY, fontSize: Math.round(size * 0.56), color: tone === "gold" ? STATION_YELLOW : STATION_BLACK }}
      >
        THE BUILDER STATION
      </span>
    </span>
  );
}

/** The stamp on its black block — the top of the sign-in and sign-up cards. */
export function StationBlock({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("grid w-full place-items-center rounded-xl py-6", className)} style={{ background: STATION_BLACK }}>
      <StationStamp size={size} />
    </span>
  );
}
