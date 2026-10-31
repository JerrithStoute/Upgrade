"use client";

import { PickWithNew, type PickOption } from "@/components/pick-with-new";
import { quickVendor } from "@/app/(app)/(directory)/vendors/actions";

/** A vendor pick list with "+ New vendor…" (saved to Subs & vendors and picked) and their paperwork note under it. */
export function VendorPick({ name = "vendorId", id, vendors, defaultValue, emptyLabel = "None", className }: { name?: string; id?: string; vendors: PickOption[]; defaultValue?: string | null; emptyLabel?: string; className?: string }) {
  return (
    <PickWithNew
      name={name}
      id={id}
      className={className}
      options={vendors}
      defaultValue={defaultValue ?? ""}
      emptyLabel={emptyLabel}
      newLabel="+ New vendor…"
      title="New sub or vendor"
      fields={[
        { name: "name", label: "Company name", required: true, wide: true, placeholder: "Smith Framing" },
        { name: "contact", label: "Contact" },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "email", label: "Email", type: "email", wide: true },
      ]}
      create={(v) => quickVendor({ name: v.name ?? "", contact: v.contact, phone: v.phone, email: v.email })}
    />
  );
}
