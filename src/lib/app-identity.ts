import "server-only";
import sharp from "sharp";
import { getCurrentUser } from "./auth";
import { db } from "./db";
import { readUpload } from "./uploads";

// The Station's own colors (as src/components/station-logo.tsx — not imported here: it loads a font).
const STATION_YELLOW = "#fbbf24";
const STATION_BLACK = "#111827";

/**
 * The app someone gets on their home screen. The team's is The Builder Station's own. A client's or a
 * sub's is their builder's: its name, logo and color — they never see The Builder Station's
 * (src/app/api/app-manifest, /api/app-icon). Each builder's clients get that builder's own app.
 */

export type AppIdentity = {
  who: "team" | "client" | "vendor";
  name: string;
  shortName: string;
  color: string;
  logoPath: string | null;
  startUrl: string;
  /** Tells apart the apps on one phone (a client of two builders gets two). */
  id: string;
  version: string;
};

const STATION: AppIdentity = { who: "team", name: "The Builder Station", shortName: "Builder Station", color: STATION_BLACK, logoPath: null, startUrl: "/dashboard", id: "/?app=station", version: "1" };

export async function appIdentity(): Promise<AppIdentity> {
  const me = await getCurrentUser().catch(() => null);
  if (!me || (me.role !== "CLIENT" && me.role !== "VENDOR")) return me ? STATION : { ...STATION, startUrl: "/" };
  const c = await db.company.findFirst({ select: { id: true, name: true, brandColor: true, logoPath: true, updatedAt: true } });
  if (!c) return STATION;
  const client = me.role === "CLIENT";
  const name = c.name || "Your builder";
  return {
    who: client ? "client" : "vendor",
    name,
    // Under the icon there's room for about 12 letters.
    shortName: name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 12),
    color: c.brandColor ?? "#1e3a5f",
    logoPath: c.logoPath,
    startUrl: client ? "/portal" : "/vendor",
    id: `/${client ? "portal" : "vendor"}?app=${c.id}`,
    version: String(c.updatedAt.getTime()),
  };
}

/** The Builder Station's stencil house (src/components/station-logo.tsx), as a picture. */
const houseSvg = (size: number, pad: number, fill: string, tile: string | null) => {
  const inner = size - pad * 2;
  const k = inner / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${tile ? `<rect width="${size}" height="${size}" fill="${tile}"/>` : ""}
<g transform="translate(${pad} ${pad}) scale(${k})" fill="${fill}">
<path d="M32 10 L56 31 H8 Z"/><rect x="43" y="11" width="6" height="11"/><path d="M13 35 H30 V43 H27 V54 H13 Z M34 35 H51 V54 H37 V43 H34 Z"/>
</g></svg>`;
};

/**
 * The app's icon, `size` pixels square, as a PNG. `maskable`: room left round the edges for phones that
 * cut icons into circles. `badge`: the small one-color mark Android shows in the status bar.
 */
export async function appIcon(app: AppIdentity, size: number, o: { maskable?: boolean; badge?: boolean } = {}): Promise<Buffer> {
  if (o.badge) return sharp(Buffer.from(houseSvg(size, Math.round(size * 0.06), "#ffffff", null))).png().toBuffer();
  if (app.who === "team") {
    // The black tile with the yellow house — full bleed, so any mask keeps the house.
    return sharp(Buffer.from(houseSvg(size, Math.round(size * (o.maskable ? 0.2 : 0.12)), STATION_YELLOW, STATION_BLACK))).png().toBuffer();
  }
  // The builder's logo on white, or (no logo yet) a plain house in their color.
  const pad = Math.round(size * (o.maskable ? 0.2 : 0.1));
  if (app.logoPath) {
    try {
      const file = await readUpload(app.logoPath);
      // A logo on a solid color (a dark box, say) fills the icon with that color; a see-through one sits on white.
      const corner = await sharp(file).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
      const tile = corner[3] > 250 ? { r: corner[0], g: corner[1], b: corner[2], alpha: 1 } : { r: 255, g: 255, b: 255, alpha: 1 };
      const logo = await sharp(file)
        .resize(size - pad * 2, size - pad * 2, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
      return sharp({ create: { width: size, height: size, channels: 4, background: tile } })
        .composite([{ input: logo, gravity: "center" }])
        .png()
        .toBuffer();
    } catch {
      // (The logo file is gone or unreadable: the plain one.)
    }
  }
  return sharp(Buffer.from(houseSvg(size, pad + Math.round(size * 0.04), "#ffffff", app.color))).png().toBuffer();
}
