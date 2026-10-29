import type { Metadata } from "next";
import { brandCss } from "@/lib/brand";
import { getBrand } from "@/lib/company-brand";
import { appIdentity } from "@/lib/app-identity";
import { AppWorker } from "@/components/phone-app";
import { Suspense } from "react";
import { ActionErrorToast } from "@/components/action-error-toast";
import { NavigationProgress } from "@/components/navigation-progress";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [brand, app] = await Promise.all([getBrand(), appIdentity()]);
  // A client's or sub's browser tab carries their builder's name, never The Builder Station's.
  const name = app.who === "team" ? "The Builder Station" : app.name;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: app.who === "team" ? "Construction project management for builders and remodelers." : `${name}: your project online.`,
    // The company logo in the browser tab, when there is one; on a home screen, the app's own icon
    // (a client's or sub's: their builder's — src/lib/app-identity.ts).
    icons: { ...(brand.logoUrl ? { icon: brand.logoUrl } : {}), apple: `/api/app-icon?s=180${app.query ? `&${app.query}` : ""}&v=${app.version}` },
    appleWebApp: { capable: true, title: app.shortName, statusBarStyle: "default" },
    // The home-screen app: a client's or sub's names their builder in the address (api/app-manifest).
    manifest: `/api/app-manifest${app.query ? `?${app.query}` : ""}`,
  };
}

export async function generateViewport() {
  return { themeColor: (await appIdentity()).color };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  const css = brandCss(brand.color);
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ActionErrorToast />
        <AppWorker />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
      </body>
    </html>
  );
}
