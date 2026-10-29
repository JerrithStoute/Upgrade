import { appIdentity } from "@/lib/app-identity";

/**
 * What a phone reads to put the app on its home screen (the "web app manifest"): the team's is The
 * Builder Station; a client's or a sub's is their builder's own (src/lib/app-identity.ts). Open
 * without a sign-in (the sign-in page has one too), so the browser asks for it with the sign-in cookie.
 */
export async function GET() {
  const app = await appIdentity();
  const icon = (size: number, purpose: "any" | "maskable") => ({
    src: `/api/app-icon?s=${size}${purpose === "maskable" ? "&mask=1" : ""}&v=${app.version}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  });
  return Response.json(
    {
      id: app.id,
      name: app.name,
      short_name: app.shortName,
      start_url: app.startUrl,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: app.color,
      icons: [icon(192, "any"), icon(512, "any"), icon(192, "maskable"), icon(512, "maskable")],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, no-cache" } },
  );
}
