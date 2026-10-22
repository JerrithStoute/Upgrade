"use client";

import { useSyncExternalStore } from "react";

/**
 * How bid emails go, remembered on this computer (the email window and Email all share it): the Excel file
 * and PDF attached, or only on the vendor's online page (lighter — lands in more inboxes from a new
 * sender); and a copy to you.
 */
export type SendHow = { attach: boolean; copyMe: boolean };

const KEY = "bids.sendHow";
const DEFAULT = '{"attach":false,"copyMe":true}';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function parse(s: string): SendHow {
  try {
    const v = JSON.parse(s) as Partial<SendHow>;
    return { attach: v.attach === true, copyMe: v.copyMe !== false };
  } catch {
    return { attach: false, copyMe: true };
  }
}

export function useSendHow(): [SendHow, (change: Partial<SendHow>) => void] {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => DEFAULT,
  );
  const how = parse(raw);
  const set = (change: Partial<SendHow>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...how, ...change }));
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
    for (const l of listeners) l();
  };
  return [how, set];
}
