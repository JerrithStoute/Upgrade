import Link from "next/link";
import { format } from "date-fns";
import { cn, initials } from "@/lib/utils";
import { barGeometry, dayIndex, ganttWindow, groupByPhase, isTaskOverdue, type GanttTask } from "@/lib/schedule";
import { CalendarRange } from "lucide-react";

/**
 * Server-rendered Gantt chart. Pure CSS grid/absolute positioning — no client JS.
 * Rows grouped by phase; left column is sticky; bars positioned by calendar day.
 */
export function Gantt({
  tasks,
  today = new Date(),
  window: fixedWindow,
  compact = false,
  taskHref,
  selectedTaskId,
  dayWidth,
}: {
  tasks: GanttTask[];
  today?: Date;
  /** Force a window (e.g. 4-week overview). Otherwise min(start)-7d .. max(end)+7d. */
  window?: { start: Date; end: Date };
  compact?: boolean;
  /** Builds the link for a task row / bar. */
  taskHref: (task: GanttTask) => string;
  selectedTaskId?: string;
  dayWidth?: number;
}) {
  const win = ganttWindow(tasks, today, fixedWindow);
  const dayW = dayWidth ?? (compact ? 24 : 16);
  const leftW = compact ? 208 : 288;
  const rowH = compact ? 32 : 44;
  const chartW = win.days * dayW;
  const weekW = dayW * 7;
  const todayIdx = dayIndex(win.start, today);
  const todayVisible = todayIdx >= 0 && todayIdx < win.days;
  const todayLeft = todayIdx * dayW + dayW / 2;
  const groups = groupByPhase(tasks);

  // Week gridlines + weekend shading (window always starts on a Monday).
  const rowBg = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${dayW * 5}px, rgba(148,163,184,0.10) ${dayW * 5}px ${weekW}px), repeating-linear-gradient(to right, transparent 0 ${weekW - 1}px, #e2e8f0 ${weekW - 1}px ${weekW}px)`,
    width: chartW,
  } as const;

  const TodayLine = () =>
    todayVisible ? (
      <div
        className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-rose-500"
        style={{ left: todayLeft }}
        aria-hidden
      />
    ) : null;

  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-500">
        <CalendarRange className="h-5 w-5 text-slate-400" /> No tasks in this window.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div style={{ width: leftW + chartW, minWidth: "100%" }} className="text-sm">
        {/* Header */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500"
            style={{ width: leftW }}
          >
            {compact ? "Task" : "Task · dates · % · owner"}
          </div>
          <div className="relative shrink-0" style={{ width: chartW, height: compact ? 32 : 36 }}>
            {win.weeks.map((w, i) => (
              <div
                key={i}
                className="absolute inset-y-0 flex items-center border-r border-slate-200 px-1.5 text-[11px] font-medium text-slate-600 whitespace-nowrap overflow-hidden"
                style={{ left: i * weekW, width: weekW }}
              >
                {format(w, i === 0 || w.getDate() <= 7 ? "MMM d" : "d")}
              </div>
            ))}
            {todayVisible ? (
              <div
                className="absolute bottom-0 z-[2] -translate-x-1/2 rounded-t bg-rose-500 px-1 text-[9px] font-semibold uppercase leading-4 text-white"
                style={{ left: todayLeft }}
              >
                Today
              </div>
            ) : null}
            <TodayLine />
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.phase}>
            {/* Phase row */}
            <div className="flex border-b border-slate-100 bg-slate-50/70">
              <div
                className="sticky left-0 z-10 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700"
                style={{ width: leftW }}
              >
                {g.phase} <span className="font-normal text-slate-400">· {g.tasks.length}</span>
              </div>
              <div className="relative shrink-0" style={{ ...rowBg, height: 24 }}>
                <TodayLine />
              </div>
            </div>

            {g.tasks.map((t) => {
              const geo = barGeometry(t, win);
              const overdue = isTaskOverdue(t, today);
              const done = t.percentComplete >= 100;
              const selected = t.id === selectedTaskId;
              const href = taskHref(t);
              const owner = t.assignee?.name;
              const pctW = Math.max(0, Math.min(100, t.percentComplete));
              return (
                <div
                  key={t.id}
                  className={cn("flex border-b border-slate-100", selected && "bg-blue-50/60")}
                  style={{ height: rowH }}
                >
                  <div
                    className={cn(
                      "sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-3",
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
                        <span className={cn(overdue && "font-medium text-rose-600")}>
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
                  <div className="relative shrink-0" style={{ ...rowBg, height: rowH }}>
                    <TodayLine />
                    {geo ? (
                      t.isMilestone ? (
                        <Link
                          href={href}
                          className="group absolute flex items-center gap-1.5"
                          style={{ left: geo.left * dayW + dayW / 2, top: 0, height: rowH, transform: "translateX(-50%)" }}
                          title={`${t.name} — ${format(t.startDate, "MMM d")}`}
                        >
                          <span
                            className={cn(
                              "block rotate-45 rounded-[2px] ring-2 ring-white",
                              compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
                            )}
                            style={{ backgroundColor: done ? t.color : "#fff", boxShadow: `0 0 0 2px ${t.color}` }}
                          />
                          <span
                            className={cn(
                              "whitespace-nowrap font-medium text-slate-700 group-hover:underline",
                              compact ? "text-[10px]" : "text-[11px]",
                            )}
                            style={{ marginLeft: compact ? 8 : 10 }}
                          >
                            {t.name}
                          </span>
                        </Link>
                      ) : (
                        <Link
                          href={href}
                          className="group absolute flex items-center"
                          style={{ left: geo.left * dayW, top: 0, height: rowH }}
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
                            style={{ width: Math.max(dayW, geo.width * dayW - 2), backgroundColor: `${t.color}40` }}
                          >
                            <span
                              className="absolute inset-y-0 left-0 block"
                              style={{ width: `${pctW}%`, backgroundColor: t.color }}
                            />
                          </span>
                          <span
                            className={cn(
                              "ml-1.5 flex items-center gap-1 whitespace-nowrap font-medium text-slate-700 group-hover:underline",
                              compact ? "text-[10px]" : "text-[11px]",
                            )}
                          >
                            {t.name}
                            {owner ? (
                              <span
                                className="grid h-4 min-w-4 place-items-center rounded-full bg-slate-200 px-0.5 text-[9px] font-semibold text-slate-700 no-underline"
                                title={owner}
                              >
                                {initials(owner)}
                              </span>
                            ) : null}
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
