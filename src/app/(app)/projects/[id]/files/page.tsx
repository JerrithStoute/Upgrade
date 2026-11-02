import Link from "@/components/link";
import { FileText, FileImage, FileSpreadsheet, File as FileIcon, FileArchive, Eye, EyeOff, FolderOpen } from "lucide-react";
import type { FileAsset } from "@prisma/client";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { cn, fmtDate } from "@/lib/utils";
import { FILE_FOLDERS } from "@/lib/constants";
import { Badge, ConfirmForm, EmptyState } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { uploadFiles, finishFileUploads, toggleFileVisibility, deleteFile } from "./actions";
import { FilesUpload } from "./files-upload";
import { undoMarkup } from "./markup-actions";
import { MarkUpPhoto } from "@/components/photos/mark-up-photo";
import { fileSrc, markable } from "@/lib/file-src";
import { FileTypesNote } from "@/components/selections/extras";

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function iconFor(mime: string, name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return { Icon: FileText, cls: "text-rose-500" };
  if (mime.includes("spreadsheet") || mime.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return { Icon: FileSpreadsheet, cls: "text-emerald-600" };
  if (mime.includes("word") || ["doc", "docx", "txt", "md"].includes(ext)) return { Icon: FileText, cls: "text-blue-600" };
  if (mime.includes("zip") || mime.includes("compressed") || ["zip", "rar", "7z"].includes(ext)) return { Icon: FileArchive, cls: "text-amber-600" };
  if (mime.startsWith("image/")) return { Icon: FileImage, cls: "text-violet-600" };
  return { Icon: FileIcon, cls: "text-slate-500" };
}

type Row = FileAsset & { uploadedBy: { name: string } | null; dailyLog: { id: string; date: Date } | null };

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  await requireView("files");
  const { id } = await params;
  const { folder } = await searchParams;
  const project = await getProject(id);
  const activeFolder = folder && (FILE_FOLDERS as readonly string[]).includes(folder) ? folder : null;
  const all = await db.fileAsset.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } }, dailyLog: { select: { id: true, date: true } } },
  });
  const files = activeFolder ? all.filter((f) => f.folder === activeFolder) : all;
  const base = `/projects/${project.id}/files`;
  const returnTo = activeFolder ? `${base}?folder=${activeFolder}` : base;
  const seg = (active: boolean) => cn("px-2.5 py-1 text-xs font-medium", active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50");
  // Photos stay a grid of pictures; every other folder is one line per file.
  const photoGrid = activeFolder === "Photos";

  const visibility = (f: Row) => (
    <form action={toggleFileVisibility}>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        title={f.clientVisible ? "The client sees it. Click to hide it." : "Only your team sees it. Click to show the client."}
        className={cn("inline-flex items-center gap-1 text-xs font-medium hover:underline", f.clientVisible ? "text-emerald-700" : "text-slate-500")}
      >
        {f.clientVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {f.clientVisible ? "Client" : "Internal"}
      </button>
    </form>
  );
  const remove = (f: Row) => (
    <ConfirmForm action={deleteFile} hidden={{ projectId: project.id, id: f.id, returnTo }} message={`Delete "${f.name}"? This removes the file from storage.`} variant="ghost" size="xs">
      <span className="text-rose-600">Delete…</span>
    </ConfirmForm>
  );
  const facts = (f: Row) => (
    <>
      {fileSize(f.size)} · {f.uploadedBy?.name ?? "Unknown"} · {fmtDate(f.createdAt)}
      {f.dailyLog ? (
        <>
          {" · "}
          <Link href={`/projects/${project.id}/daily-logs/${f.dailyLog.id}/edit`} className="text-blue-700 hover:underline">
            Log {fmtDate(f.dailyLog.date, "MMM d")}
          </Link>
        </>
      ) : null}
    </>
  );
  // A marked-up photo: see the original, or put it back.
  const marked = (f: Row) =>
    f.originalStoragePath ? (
      <span className="inline-flex items-center gap-2 text-xs text-slate-500">
        Marked up
        <a href={`/api/files/${f.id}?original=1`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
          Original
        </a>
        <ConfirmForm action={undoMarkup} hidden={{ id: f.id, returnTo }} message={`Take the markup off "${f.name}" and put the original back?`} variant="ghost" size="xs">
          <span className="text-blue-700">Undo markup…</span>
        </ConfirmForm>
      </span>
    ) : null;
  const findText = (f: Row) => [f.name, f.folder, f.uploadedBy?.name].filter(Boolean).join(" ").toLowerCase();

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {all.length} file{all.length === 1 ? "" : "s"} · {fileSize(all.reduce((s, f) => s + f.size, 0))} · {all.filter((f) => f.clientVisible).length} the client sees
      </p>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          {files.length ? <ListFind listId="file-list" placeholder="Find a file…" /> : null}
          <div className="flex flex-wrap overflow-hidden rounded-md ring-1 ring-inset ring-slate-200">
            <Link href={base} className={seg(!activeFolder)}>
              All {all.length}
            </Link>
            {FILE_FOLDERS.map((f) => (
              <Link key={f} href={`${base}?folder=${f}`} className={seg(activeFolder === f)}>
                {f} {all.filter((x) => x.folder === f).length}
              </Link>
            ))}
          </div>
        </header>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Everything for this job. Daily log photos land in Photos. Click <span className="font-medium">Client</span> / <span className="font-medium">Internal</span> to change
          who sees a file.
        </p>
        <div className="px-4 py-2.5">
          <FilesUpload
            projectId={project.id}
            returnTo={returnTo}
            folders={FILE_FOLDERS}
            defaultFolder={activeFolder ?? "Documents"}
            action={uploadFiles}
            finish={finishFileUploads}
            typesNote={<FileTypesNote />}
          />
        </div>

        {files.length === 0 ? (
          <EmptyState icon={FolderOpen} title={activeFolder ? `Nothing in ${activeFolder}` : "No files yet"} description="Drop plans, contracts, permits and photos above to keep everything with the job." />
        ) : (
          <div id="file-list" className="border-t border-slate-100">
            <div data-find-group>
              {photoGrid ? (
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {files.map((f) => {
                    const isImage = f.mimeType.startsWith("image/");
                    const { Icon, cls } = iconFor(f.mimeType, f.name);
                    return (
                      <div key={f.id} data-find={findText(f)} className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div className="relative">
                          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block bg-slate-50" title={`Open ${f.name}`}>
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={fileSrc(f)} alt={f.name} className="h-36 w-full object-cover" />
                            ) : (
                              <div className="grid h-36 w-full place-items-center">
                                <Icon className={cn("h-12 w-12", cls)} strokeWidth={1.25} />
                              </div>
                            )}
                          </a>
                          {markable(f.mimeType) ? <MarkUpPhoto id={f.id} name={f.name} chip /> : null}
                        </div>
                        <div className="space-y-1 px-2.5 py-2">
                          <p className="truncate text-xs font-medium text-slate-900" title={f.name}>
                            {f.name}
                          </p>
                          <p className="text-[11px] text-slate-500">{facts(f)}</p>
                          {marked(f)}
                          <div className="flex items-center justify-between gap-1">
                            {visibility(f)}
                            {remove(f)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ul>
                  {files.map((f) => {
                    const isImage = f.mimeType.startsWith("image/");
                    const { Icon, cls } = iconFor(f.mimeType, f.name);
                    return (
                      <li key={f.id} data-find={findText(f)} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 first:border-t-0">
                        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileSrc(f)} alt="" className="h-9 w-9 object-cover" />
                          ) : (
                            <Icon className={cn("h-5 w-5", cls)} strokeWidth={1.5} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-medium text-blue-700 hover:underline" title={`Open ${f.name}`}>
                              {f.name}
                            </a>
                            {activeFolder ? null : <Badge className="shrink-0">{f.folder}</Badge>}
                          </div>
                          <p className="text-xs text-slate-500">{facts(f)}</p>
                          {marked(f)}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {markable(f.mimeType) ? <MarkUpPhoto id={f.id} name={f.name} /> : null}
                          {visibility(f)}
                          <a href={`/api/files/${f.id}?download=1`} className="text-xs font-medium text-blue-700 hover:underline">
                            Download
                          </a>
                          {remove(f)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
                None match.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
