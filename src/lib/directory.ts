import { allows, type Access } from "./access";

/** The Directory tabs this person may open: Clients (the leads permission), Subs & vendors (the lists'), and Team (everyone). */
export function directoryTabs(role: string, access: Access) {
  return [
    ...(role === "ADMIN" || allows(access, "leads", 1) ? ["/clients"] : []),
    ...(role === "ADMIN" || allows(access, "lists", 1) ? ["/vendors"] : []),
    "/team",
  ];
}
