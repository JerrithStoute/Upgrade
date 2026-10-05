import type { Metadata } from "next";
import { brandCss } from "@/lib/brand";
import { getBrand } from "@/lib/company-brand";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: "Upgrade", template: "%s · Upgrade" },
    description: "Construction project management for builders and remodelers.",
    // The company logo in the browser tab, when there is one.
    ...(brand.logoUrl ? { icons: { icon: brand.logoUrl } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  const css = brandCss(brand.color);
  return (
    <html lang="en" className="h-full antialiased">
      <head>{css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}</head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
