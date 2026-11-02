import { FileText } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { warrantyLabel, warrantyTone } from "@/lib/warranty";
import { markable } from "@/lib/file-src";
import { MarkUpPhoto } from "@/components/photos/mark-up-photo";

/** A request's status, the same words for the client, the sub and the team. */
export function WarrantyStatus({ status, urgent }: { status: string; urgent?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", warrantyTone(status))}>{warrantyLabel(status)}</span>
      {urgent && (status === "NEW" || status === "SCHEDULED") ? (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">Urgent</span>
      ) : null}
    </span>
  );
}

/** Its photos (and any PDF): small pictures that open full size. `markUp`: your team's view, a pencil on each photo. */
export function WarrantyPhotos({
  files,
  small,
  markUp,
}: {
  files: { id: string; name: string; mimeType: string; /** The picture's address (it changes when the photo's marked up). */ src?: string }[];
  small?: boolean;
  markUp?: boolean;
}) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id} className="relative">
          <a href={`/api/files/${f.id}?open=1`} target="_blank" rel="noreferrer" title={f.name} className="block">
            {f.mimeType.startsWith("image/") && f.mimeType !== "image/heic" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.src ?? `/api/files/${f.id}`} alt={f.name} className={cn("rounded-md object-cover ring-1 ring-slate-200", small ? "h-12 w-12" : "h-20 w-20")} />
            ) : (
              <span className={cn("flex flex-col items-center justify-center gap-1 rounded-md bg-slate-50 px-1 text-center text-[10px] text-slate-600 ring-1 ring-slate-200", small ? "h-12 w-12" : "h-20 w-20")}>
                <FileText className="h-5 w-5 text-slate-400" />
                <span className="line-clamp-2 break-all">{f.name}</span>
              </span>
            )}
          </a>
          {markUp && markable(f.mimeType) ? <MarkUpPhoto id={f.id} name={f.name} chip className="h-5 w-5 [&_svg]:h-3 [&_svg]:w-3" /> : null}
        </li>
      ))}
    </ul>
  );
}

type Note = { id: string; body: string; teamOnly: boolean; createdAt: Date; author: { name: string; role: string } | null };

/** The notes on a request, oldest first. `showTeamOnly`: mark the ones the client doesn't see. */
export function WarrantyNotes({ notes, showTeamOnly, dateTime }: { notes: Note[]; showTeamOnly?: boolean; dateTime?: (d: Date) => string }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.id} className={cn("rounded-md px-3 py-2 text-sm", n.teamOnly && showTeamOnly ? "bg-amber-50 ring-1 ring-inset ring-amber-200" : "bg-slate-50")}>
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{n.author?.name ?? "Someone"}</span>
            {n.author?.role === "CLIENT" ? " (homeowner)" : n.author?.role === "VENDOR" ? " (sub)" : ""}
            {" · "}
            {dateTime ? dateTime(n.createdAt) : fmtDate(n.createdAt)}
            {n.teamOnly && showTeamOnly ? <span className="ml-1 font-medium text-amber-800">· team only</span> : null}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-slate-800">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}

/** The photo picker every warranty form uses. `compact`: no label of its own (it sits in a labelled row). */
export function PhotoInput({ id = "photos", label = "Photos", compact }: { id?: string; label?: string; compact?: boolean }) {
  if (compact)
    return (
      <div>
        <input
          id={id}
          name="photos"
          type="file"
          multiple
          accept="image/*,.heic,.pdf"
          aria-label={label}
          className="block w-full text-xs text-slate-600 file:mr-2 file:h-7 file:rounded-md file:border file:border-solid file:border-slate-300 file:bg-white file:px-2.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50"
        />
        <p className="mt-0.5 text-xs text-slate-500">Up to 10. A picture saves a lot of explaining.</p>
      </div>
    );
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} name="photos" type="file" multiple accept="image/*,.heic,.pdf" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200" />
      <p className="mt-1 text-xs text-slate-500">Up to 10. A picture saves a lot of explaining.</p>
    </div>
  );
}
