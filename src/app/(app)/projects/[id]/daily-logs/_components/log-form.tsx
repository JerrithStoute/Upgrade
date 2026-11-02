import Link from "@/components/link";
import { WEATHER } from "@/lib/constants";
import { dateInput } from "@/lib/utils";
import { SubmitButton } from "@/components/ui";
import { PhotoPicker } from "@/components/photos/photo-picker";

type Values = {
  date?: Date | null;
  weather?: string | null;
  tempHigh?: number | null;
  tempLow?: number | null;
  weatherNotes?: string | null;
  crewCount?: number;
  hoursWorked?: number;
  workCompleted?: string | null;
  issues?: string | null;
  notes?: string | null;
  clientVisible?: boolean;
};

/** A field's name: small and gray, over its box. */
function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs text-slate-500">
      {children}
    </label>
  );
}

/**
 * A daily log's form, new or edit: one card with the date, Client sees it, Cancel and Save on top, a gray
 * note, then what's written every day first — work done, photos, issues — and weather, crew and hours
 * on two short lines. Save is at the bottom too, so nobody scrolls back up after adding photos.
 */
export function LogForm({
  title,
  action,
  hidden,
  values,
  note,
  cancelHref,
}: {
  title: string;
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  values: Values;
  note: React.ReactNode;
  cancelHref: string;
}) {
  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <input
          id="log-date"
          type="date"
          name="date"
          aria-label="Date"
          className="h-7 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 pointer-coarse:h-9 pointer-coarse:text-base"
          required
          defaultValue={dateInput(values.date ?? new Date())}
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input type="checkbox" name="clientVisible" defaultChecked={values.clientVisible ?? true} className="h-4 w-4 rounded border-slate-300" />
          Client sees it
        </label>
        <div className="ml-auto flex items-center gap-3">
          <Link href={cancelHref} className="text-xs font-medium text-blue-700 hover:underline">
            Cancel
          </Link>
          <SubmitButton size="xs" pendingText="Saving…">
            Save log
          </SubmitButton>
        </div>
      </header>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">{note}</p>

      <div className="space-y-4 px-4 py-3">
        <div>
          <Label htmlFor="log-work">Work done</Label>
          <textarea id="log-work" name="workCompleted" className="input" rows={4} defaultValue={values.workCompleted ?? ""} placeholder="What got done today?" />
        </div>
        <div>
          <Label htmlFor="log-photos">Photos</Label>
          {/* On a phone: Take photo opens the camera; Add photos offers the camera or the photo library. */}
          <PhotoPicker id="log-photos" name="photos" photosOnly />
          <p className="mt-1 text-[11px] text-slate-400">Tap a photo to mark it up. They&apos;re saved to the job&apos;s Photos folder too.</p>
        </div>
        <div>
          <Label htmlFor="log-issues">Issues / delays</Label>
          <textarea
            id="log-issues"
            name="issues"
            className="input"
            rows={2}
            defaultValue={values.issues ?? ""}
            placeholder="Anything blocking progress, safety items, inspection results…"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Label htmlFor="log-weather">Weather</Label>
            <select id="log-weather" name="weather" className="input" defaultValue={values.weather ?? ""}>
              <option value="">—</option>
              {WEATHER.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div className="w-20">
            <Label htmlFor="log-hi">High °F</Label>
            <input id="log-hi" type="number" name="tempHigh" className="input" defaultValue={values.tempHigh ?? ""} />
          </div>
          <div className="w-20">
            <Label htmlFor="log-lo">Low °F</Label>
            <input id="log-lo" type="number" name="tempLow" className="input" defaultValue={values.tempLow ?? ""} />
          </div>
          <div className="min-w-56 flex-1">
            <Label htmlFor="log-weather-notes">Weather notes</Label>
            <textarea
              id="log-weather-notes"
              name="weatherNotes"
              className="input field-sizing-content"
              rows={1}
              defaultValue={values.weatherNotes ?? ""}
              placeholder="Rained out after lunch, too windy to set trusses…"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Label htmlFor="log-crew">Crew on site</Label>
            <input id="log-crew" type="number" min={0} name="crewCount" className="input" defaultValue={values.crewCount ?? 0} />
          </div>
          <div className="w-28">
            <Label htmlFor="log-hours">Hours worked</Label>
            <input id="log-hours" type="number" min={0} step="0.5" name="hoursWorked" className="input" defaultValue={values.hoursWorked ?? 0} />
          </div>
          <div className="min-w-56 flex-1">
            <Label htmlFor="log-notes">
              Internal notes <span className="text-slate-400">(only your team)</span>
            </Label>
            <textarea id="log-notes" name="notes" className="input field-sizing-content" rows={1} defaultValue={values.notes ?? ""} />
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5">
        <SubmitButton size="xs" pendingText="Saving…">
          Save log
        </SubmitButton>
      </div>
    </form>
  );
}
