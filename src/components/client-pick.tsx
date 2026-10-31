"use client";

import { PickWithNew, type PickOption } from "@/components/pick-with-new";
import { quickClient } from "@/app/(app)/(directory)/clients/actions";

/** The client list on the job form, with "+ New client…": saved and picked without leaving the job you're making. */
export function ClientPick({ name = "clientId", id, clients, defaultValue }: { name?: string; id?: string; clients: PickOption[]; defaultValue?: string | null }) {
  return (
    <PickWithNew
      name={name}
      id={id}
      options={clients}
      defaultValue={defaultValue ?? ""}
      emptyLabel="— No client —"
      newLabel="+ New client…"
      title="New client"
      fields={[
        { name: "firstName", label: "First name", required: true },
        { name: "lastName", label: "Last name", required: true },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "email", label: "Email", type: "email" },
        { name: "address", label: "Address", wide: true },
      ]}
      create={(v) => quickClient({ firstName: v.firstName ?? "", lastName: v.lastName ?? "", phone: v.phone, email: v.email, address: v.address })}
    />
  );
}
