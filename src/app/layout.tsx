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
  return {
    title: { default: "The Builder Station", template: "%s · The Builder Station" },
    description: "Construction project management for builders and remodelers.",
    // The company logo in the browser tab, when there is one; on a home screen, the app's own icon
    // (a client's or sub's: their builder's — src/lib/app-identity.ts).
    icons: { ...(brand.logoUrl ? { icon: brand.logoUrl } : {}), apple: `/api/app-icon?s=180&v=${app.version}` },
    appleWebApp: { capable: true, title: app.shortName, statusBarStyle: "default" },
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
        {/* The home-screen app: asked for with the sign-in, so a client gets their builder's (api/app-manifest). */}
        <link rel="manifest" href="/api/app-manifest" crossOrigin="use-credentials" />
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
