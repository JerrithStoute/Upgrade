import Link from "next/link";
import { FileText, FileImage, FileSpreadsheet, File as FileIcon, FileArchive, Eye, EyeOff, ExternalLink, Upload, FolderOpen } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { cn, fmtDate } from "@/lib/utils";
import { FILE_FOLDERS } from "@/lib/constants";
import { Badge, Button, SubmitButton, ConfirmForm, Collapsible, Field, FormGrid, EmptyState } from "@/components/ui";
import { uploadFiles, toggleFileVisibility, deleteFile } from "./actions";

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

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  await requireStaff();
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
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={base} className={chip(!activeFolder)}>
            All · {all.length}
          </Link>
          {FILE_FOLDERS.map((f) => (
            <Link key={f} href={`${base}?folder=${f}`} className={chip(activeFolder === f)}>
              {f} · {all.filter((x) => x.folder === f).length}
            </Link>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {files.length} file{files.length === 1 ? "" : "s"} · {fileSize(files.reduce((s, f) => s + f.size, 0))}
        </span>
      </div>

      <Collapsible
        defaultOpen={all.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload files
          </span>
        }
      >
        <form action={uploadFiles} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <FormGrid className="md:grid-cols-3">
            <Field label="Folder" htmlFor="up-folder">
              <select id="up-folder" name="folder" className="input" defaultValue={activeFolder ?? "Documents"}>
                {FILE_FOLDERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Files" htmlFor="up-files" className="md:col-span-2" hint="Up to 25 MB each">
              <input id="up-files" type="file" name="files" multiple required className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
            </Field>
          </FormGrid>
          <div className="flex items-center gap-4">
            <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="clientVisible" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Visible to client
            </label>
          </div>
        </form>
      </Collapsible>

      {files.length === 0 ? (
        <EmptyState icon={FolderOpen} title={activeFolder ? `Nothing in ${activeFolder}` : "No files yet"} description="Upload plans, contracts, permits and photos to keep everything with the project." />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {files.map((f) => {
            const isImage = f.mimeType.startsWith("image/");
            const { Icon, cls } = iconFor(f.mimeType, f.name);
            return (
              <div key={f.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block bg-slate-50" title={`Open ${f.name}`}>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${f.id}`} alt={f.name} className="h-36 w-full object-cover" />
                  ) : (
                    <div className="grid h-36 w-full place-items-center">
                      <Icon className={cn("h-12 w-12", cls)} strokeWidth={1.25} />
                    </div>
                  )}
                </a>
                <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-900" title={f.name}>
                      {f.name}
                    </p>
                    <Badge className="shrink-0">{f.folder}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {fileSize(f.size)} · {f.uploadedBy?.name ?? "Unknown"} · {fmtDate(f.createdAt)}
                    {f.dailyLog ? (
                      <>
                        {" · "}
                        <Link href={`/projects/${project.id}/daily-logs/${f.dailyLog.id}/edit`} className="underline">
                          Log {fmtDate(f.dailyLog.date, "MMM d")}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-auto flex items-center gap-1 border-t border-slate-100 pt-2">
                    <form action={toggleFileVisibility}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button type="submit" variant="ghost" size="sm" title={f.clientVisible ? "Visible to client — click to hide" : "Hidden from client — click to show"}>
                        {f.clientVisible ? <Eye className="h-3.5 w-3.5 text-emerald-600" /> : <EyeOff className="h-3.5 w-3.5 text-slate-400" />}
                        <span className={cn("text-xs", f.clientVisible ? "text-emerald-700" : "text-slate-500")}>{f.clientVisible ? "Client" : "Internal"}</span>
                      </Button>
                    </form>
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                    <div className="ml-auto">
                      <ConfirmForm action={deleteFile} hidden={{ projectId: project.id, id: f.id, returnTo }} message={`Delete "${f.name}"? This removes the file from storage.`} variant="ghost">
                        <span className="text-xs text-rose-600">Delete</span>
                      </ConfirmForm>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
