"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Check, Download, Share, Smartphone, X } from "lucide-react";
import { removePushDevice, savePushDevice, sendTestPush, setPushKinds } from "@/app/account/push-actions";

/**
 * The home-screen app, in the browser: its worker (notifications — public/sw.js), installing it, and
 * turning notifications on. iPhones only allow notifications from the app on the home screen, so
 * there it's install first, then notifications from inside the app.
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Starts the worker on every page (it only shows notifications; pages always come fresh). */
export function AppWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Chrome / Android offer their own install button: kept for ours.
    const keep = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __installEvent?: InstallEvent }).__installEvent = e as InstallEvent;
      window.dispatchEvent(new Event("app-installable"));
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);
  return null;
}

function useDevice() {
  const [d, setD] = useState({ ready: false, standalone: false, ios: false, android: false, phone: false, canInstall: false, pushable: false });
  useEffect(() => {
    const look = () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      setD({
        ready: true,
        standalone,
        ios,
        android: /Android/.test(ua),
        phone: ios || /Android|Mobile/.test(ua),
        canInstall: !!(window as unknown as { __installEvent?: InstallEvent }).__installEvent,
        pushable: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext,
      });
    };
    look();
    window.addEventListener("app-installable", look);
    window.addEventListener("appinstalled", look);
    return () => {
      window.removeEventListener("app-installable", look);
      window.removeEventListener("appinstalled", look);
    };
  }, []);
  return d;
}

async function install() {
  const e = (window as unknown as { __installEvent?: InstallEvent }).__installEvent;
  if (!e) return;
  await e.prompt();
  await e.userChoice.catch(() => null);
  (window as unknown as { __installEvent?: InstallEvent }).__installEvent = undefined;
  window.dispatchEvent(new Event("app-installable"));
}

/** How to put it on the home screen, on this device. */
function InstallSteps({ name, d }: { name: string; d: ReturnType<typeof useDevice> }) {
  if (d.standalone)
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <Check className="h-4 w-4" /> You&apos;re using the app.
      </p>
    );
  if (d.canInstall)
    return (
      <button type="button" onClick={() => void install()} className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800">
        <Download className="h-4 w-4" /> Install the app
      </button>
    );
  if (d.ios)
    return (
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>
          Open this page in <b>Safari</b> itself (not inside Gmail, Facebook or Messages).
        </li>
        <li>
          Tap the <b>Share</b> button <Share className="inline h-4 w-4 align-text-bottom" />. On newer iPhones, tap <b>⋯</b> at the bottom right first, then <b>Share</b>.
        </li>
        <li>
          Scroll down past the apps and tap <b>Add to Home Screen</b> (not there? <b>Edit Actions…</b> at the bottom adds it), then <b>Add</b>.
        </li>
        <li>Open {name} from your home screen.</li>
      </ol>
    );
  if (d.android)
    return (
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>
          Open this page in <b>Chrome</b>.
        </li>
        <li>
          Tap the <b>⋮</b> menu (top right), then <b>Add to Home screen</b> or <b>Install app</b>.
        </li>
        <li>Open {name} from your home screen.</li>
      </ol>
    );
  return <p className="text-sm text-slate-600">On your phone, open this site and come to this page — it shows how to put {name} on your home screen.</p>;
}

/** The "Phone app" card on the account page: install, notifications on this device, and which ones. */
export function PhoneAppCard({ name, publicKey, kinds }: { name: string; publicKey: string | null; kinds: { key: string; label: string; on: boolean }[] }) {
  const d = useDevice();
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState(() => new Set(kinds.filter((k) => k.on).map((k) => k.key)));

  useEffect(() => {
    if (!d.pushable) return;
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then(setSub, () => setSub(null));
  }, [d.pushable]);

  const turnOn = () =>
    start(async () => {
      setNote(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setNote(d.ios ? "Notifications are blocked — turn them on in Settings → Notifications → " + name + "." : "Notifications are blocked for this site — allow them in your browser's site settings, then try again.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey! }));
        const label = d.ios ? "iPhone" : d.android ? "Android phone" : /Windows/.test(navigator.userAgent) ? "Windows computer" : /Mac/.test(navigator.userAgent) ? "Mac" : "This device";
        await savePushDevice(s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, label);
        setSub(s);
        const { sent } = await sendTestPush();
        setNote(sent ? "On — a test notification is on its way." : "On.");
      } catch {
        setNote("Notifications couldn't be turned on here. Try again, or from the app on your home screen.");
      }
    });

  const turnOff = () =>
    start(async () => {
      setNote(null);
      if (sub) {
        await removePushDevice(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setSub(null);
    });

  const toggleKind = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    setPicked(next);
    start(() => setPushKinds([...next] as Parameters<typeof setPushKinds>[0]));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Smartphone className="h-4 w-4 text-slate-400" /> On your home screen
        </h3>
        {d.ready ? <InstallSteps name={name} d={d} /> : null}
      </div>

      {publicKey ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bell className="h-4 w-4 text-slate-400" /> Notifications
          </h3>
          {!d.ready ? null : d.ios && !d.standalone ? (
            <p className="text-sm text-slate-600">On an iPhone, add the app to your home screen first (above), open it from there, and turn notifications on here.</p>
          ) : !d.pushable ? (
            <p className="text-sm text-slate-600">This browser can&apos;t show notifications. Use the app on your phone, or Chrome, Edge or Safari.</p>
          ) : sub ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm text-emerald-700">
                <Check className="h-4 w-4" /> On for this {d.phone ? "phone" : "device"}
              </span>
              <button type="button" disabled={busy} onClick={turnOff} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                <BellOff className="h-4 w-4" /> Turn off here
              </button>
            </div>
          ) : sub === null ? (
            <button type="button" disabled={busy} onClick={turnOn} className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60">
              <Bell className="h-4 w-4" /> {busy ? "Turning on…" : `Turn on notifications${d.phone ? " on this phone" : " here"}`}
            </button>
          ) : null}
          {note ? <p className="text-xs text-slate-600">{note}</p> : null}
          <fieldset className="space-y-1.5 pt-1">
            <legend className="mb-1 text-xs text-slate-500">Notify me about</legend>
            {kinds.map((k) => (
              <label key={k.key} className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={picked.has(k.key)} onChange={(e) => toggleKind(k.key, e.currentTarget.checked)} />
                {k.label}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

/** A nudge on the home page, on phones only, until they install it or close it. */
export function GetTheAppBanner({ name }: { name: string }) {
  const d = useDevice();
  // (Read on the first render in the browser: nothing shows until useDevice is ready anyway, so the
  // server's empty render and the browser's first one match.)
  const [closed, setClosed] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem("app-banner-closed") === "1";
    } catch {
      return false;
    }
  });
  if (!d.ready || d.standalone || !d.phone || closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem("app-banner-closed", "1");
    } catch {}
  };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
      <Smartphone className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        Put <b>{name}</b> on your home screen — and get a buzz when something&apos;s waiting for you.
      </span>
      {d.canInstall ? (
        <button type="button" onClick={() => void install()} className="shrink-0 rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-medium text-white">
          Install
        </button>
      ) : (
        <a href="/account#app" className="shrink-0 rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-medium text-white">
          How
        </a>
      )}
      <button type="button" onClick={close} aria-label="Close" className="shrink-0 rounded p-1 text-blue-700 hover:bg-blue-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
