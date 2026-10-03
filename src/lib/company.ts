/** Your company for the top of a printout: name, address, phone / email. */
export function companyLines(
  c: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null; email: string | null } | null,
) {
  if (!c) return [];
  const place = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [c.name, c.address ?? "", place, [c.phone, c.email].filter(Boolean).join(" · ")].filter(Boolean);
}
