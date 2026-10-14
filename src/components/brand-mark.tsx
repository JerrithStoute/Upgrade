import { StationIcon } from "@/components/station-logo";
import { cn } from "@/lib/utils";

/**
 * The company's logo, or (no logo yet) The Builder Station's own icon.
 * `size`: "sm" for the menu and portal bar, "lg" for the sign-in page.
 */
export function BrandMark({ logoUrl, size = "sm", className }: { logoUrl: string | null; size?: "sm" | "lg"; className?: string }) {
  if (logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="Company logo" className={cn("shrink-0 object-contain", size === "lg" ? "max-h-20 max-w-[18rem]" : "max-h-14 max-w-[13rem]", className)} />
    );
  return <StationIcon size={size === "lg" ? 40 : 32} className={className} />;
}

/** The logo at the top of a printout (proposal, invoice, vendor sheet) — nothing when there isn't one. */
export function PrintLogo({ logoUrl, className }: { logoUrl: string | null; className?: string }) {
  if (!logoUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt="Company logo" className={cn("mb-2 max-h-16 max-w-[16rem] object-contain", className)} />;
}
