import Link from "next/link";
import { format } from "date-fns";
import { cn, initials } from "@/lib/utils";
import { barGeometry, dayIndex, ganttWindow, groupByPhase, isTaskOverdue, type GanttTask } from "@/lib/schedule";
import { CalendarRange } from "lucide-react";

/**
 * Server-rendered Gantt chart. Pure CSS (flex + absolute positioning with percentage offsets),
 * so the whole window always fits the available width — no client JS, no horizontal scrolling
 * at desktop widths. Rows are grouped by phase; the left column lists name/dates/%/owner.
 */
export function Gantt({
  tasks,
  today = new Date(),
  window: fixedWindow,
  compact = false,
  taskHref,
  selectedTaskId,
}: {
  tasks: GanttTask[];
  today?: Date;
  /** Force a window (e.g. 4-week overview). Otherwise min(start)-7d .. max(end)+7d. */
  window?: { start: Date; end: Date };
  compact?: boolean;
  /** Builds the link for a task row / bar. */
  taskHref: (task: GanttTask) => string;
  selectedTaskId?: string;
}) {
  const win = ganttWindow(tasks, today, fixedWindow);
  const leftW = compact ? 200 : 272;
  const rowH = compact ? 32 : 44;
  const headerH = compact ? 36 : 40;
  const weekPct = 700 / win.days / 7; // not used for layout — only for label density heuristics
  const weekCount = win.weeks.length;
  // Assume ~700px of chart width at desktop; label every week when there's room, else thin out.
  const estWeekPx = 700 / weekCount;
  const labelEvery = estWeekPx >= 44 ? 1 : Math.ceil(44 / estWeekPx);
  const pctOfDay = (d: number) => `${(d / win.days) * 100}%`;
  const todayIdx = dayIndex(win.start, today);
  const todayVisible = todayIdx >= 0 && todayIdx < win.days;
  const todayLeft = pctOfDay(todayIdx + 0.5);
  const groups = groupByPhase(tasks);
  void weekPct;

  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
        <CalendarRange className="h-5 w-5 text-slate-400" /> No tasks in this window.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative min-w-[720px] text-sm">
        {/* Grid overlay: week columns, weekend shading and today line — behind rows, right of the left column. */}
        <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: leftW }} aria-hidden>
          {win.weeks.map((w, i) => (
            <div
              key={i}
              className="absolute inset-y-0 border-r border-slate-200"
              style={{ left: pctOfDay(i * 7), width: pctOfDay(7) }}
            >
              <div className="absolute inset-y-0 right-0 bg-slate-400/10" style={{ width: `${(2 / 7) * 100}%` }} />
            </div>
          ))}
          {todayVisible ? <div className="absolute inset-y-0 w-px bg-rose-500" style={{ left: todayLeft }} /> : null}
        </div>

        {/* Header */}
        <div className="relative flex border-b border-slate-200" style={{ height: headerH }}>
          <div
            className="flex shrink-0 items-end border-r border-slate-200 bg-slate-50 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500"
            style={{ width: leftW }}
          >
            {compact ? "Task" : "Task · dates · % · owner"}
          </div>
          <div className="relative min-w-0 flex-1 bg-slate-50/60">
            {win.weeks.map((w, i) =>
              i % labelEvery === 0 ? (
                <div
                  key={i}
                  className="absolute bottom-0 flex h-5 items-center overflow-hidden whitespace-nowrap px-1.5 text-[11px] font-medium text-slate-600"
                  style={{ left: pctOfDay(i * 7), width: pctOfDay(7 * labelEvery) }}
                >
                  {format(w, i === 0 || w.getDate() <= 7 || labelEvery > 1 ? "MMM d" : "d")}
                </div>
              ) : null,
            )}
            {todayVisible ? (
              <div
                className="absolute top-1 z-[2] rounded-sm bg-rose-500 px-1 text-[9px] font-semibold uppercase leading-4 text-white"
                style={{ left: todayLeft, marginLeft: 3 }}
              >
                Today
              </div>
            ) : null}
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.phase}>
            {/* Phase row */}
            <div className="relative flex border-b border-slate-100" style={{ height: compact ? 22 : 24 }}>
              <div
                className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-700"
                style={{ width: leftW }}
              >
                <span className="truncate">
                  {g.phase} <span className="font-normal text-slate-400">· {g.tasks.length}</span>
                </span>
              </div>
              <div className="min-w-0 flex-1 bg-slate-50/50" />
            </div>

            {g.tasks.map((t) => {
              const geo = barGeometry(t, win);
              const overdue = isTaskOverdue(t, today);
              const done = t.percentComplete >= 100;
              const selected = t.id === selectedTaskId;
              const href = taskHref(t);
              const owner = t.assignee?.name;
              const pctW = Math.max(0, Math.min(100, t.percentComplete));
              // Put the label on the left of the bar when the bar sits in the right quarter of the window.
              const labelLeft = geo ? (geo.left + geo.width) / win.days > 0.72 : false;
              const labelClass = cn(
                "flex items-center gap-1 whitespace-nowrap font-medium text-slate-700 group-hover:underline",
                compact ? "text-[10px]" : "text-[11px]",
              );
              const ownerChip = owner ? (
                <span
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-slate-200 px-0.5 text-[9px] font-semibold text-slate-700"
                  title={owner}
                >
                  {initials(owner)}
                </span>
              ) : null;
              return (
                <div
                  key={t.id}
                  className={cn("relative flex border-b border-slate-100", selected && "bg-blue-50/60")}
                  style={{ height: rowH }}
                >
                  <div
                    className={cn(
                      "flex shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-3",
                      selected && "bg-blue-50",
                    )}
                    style={{ width: leftW }}
                  >
                    <Link
                      href={href}
                      className={cn(
                        "truncate font-medium leading-tight hover:underline",
                        compact ? "text-xs" : "text-[13px]",
                        done ? "text-slate-500" : "text-slate-900",
                      )}
                      title={t.name}
                    >
                      {t.isMilestone ? <span className="mr-1 text-violet-600">◆</span> : null}
                      {t.name}
                    </Link>
                    {!compact ? (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-tight text-slate-500 tabular-nums">
                        <span className={cn("whitespace-nowrap", overdue && "font-medium text-rose-600")}>
                          {t.isMilestone
                            ? format(t.startDate, "MMM d")
                            : `${format(t.startDate, "MMM d")} – ${format(t.endDate, "MMM d")}`}
                        </span>
                        <span>·</span>
                        <span className={cn(done ? "text-emerald-700" : overdue ? "text-rose-600" : "")}>
                          {t.percentComplete}%
                        </span>
                        {owner ? (
                          <>
                            <span>·</span>
                            <span className="truncate" title={owner}>
                              {owner}
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="relative min-w-0 flex-1 overflow-hidden">
                    {geo ? (
                      t.isMilestone ? (
                        <Link
                          href={href}
                          className={cn("group absolute inset-y-0 flex items-center gap-2", labelLeft && "flex-row-reverse")}
                          style={
                            labelLeft
                              ? { right: `calc(${pctOfDay(win.days - geo.left - 0.5)} - ${compact ? 5 : 7}px)` }
                              : { left: `calc(${pctOfDay(geo.left + 0.5)} - ${compact ? 5 : 7}px)` }
                          }
                          title={`${t.name} — ${format(t.startDate, "MMM d")}`}
                        >
                          <span
                            className={cn("block shrink-0 rotate-45 rounded-[2px]", compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")}
                            style={{ backgroundColor: done ? t.color : "#fff", boxShadow: `0 0 0 2px ${t.color}` }}
                          />
                          <span className={labelClass}>
                            {t.name}
                            {ownerChip}
                          </span>
                        </Link>
                      ) : (
                        <Link
                          href={href}
                          className={cn("group absolute inset-y-0 flex items-center gap-1.5", labelLeft && "flex-row-reverse")}
                          style={labelLeft ? { right: pctOfDay(win.days - geo.left - geo.width) } : { left: pctOfDay(geo.left) }}
                          title={`${t.name}: ${format(t.startDate, "MMM d")} – ${format(t.endDate, "MMM d")} (${t.percentComplete}%)`}
                        >
                          <span
                            className={cn(
                              "relative block shrink-0 overflow-hidden rounded",
                              compact ? "h-4" : "h-5",
                              overdue && "ring-2 ring-rose-400 ring-offset-1",
                              geo.clippedStart && "rounded-l-none",
                              geo.clippedEnd && "rounded-r-none",
                            )}
                            style={{ width: `max(6px, ${pctOfDay(geo.width)})`, minWidth: 6, backgroundColor: `${t.color}40` }}
                          >
                            <span className="absolute inset-y-0 left-0 block" style={{ width: `${pctW}%`, backgroundColor: t.color }} />
                          </span>
                          <span className={labelClass}>
                            {t.name}
                            {ownerChip}
                          </span>
                        </Link>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
