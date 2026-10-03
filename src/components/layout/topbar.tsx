import Link from "next/link";
import { LogOut, Bell } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { SessionUser } from "@/lib/auth";
import { TopbarTitle } from "./topbar-slot";

export function Topbar({ user, title }: { user: SessionUser; title?: string }) {
  return (
    <header className="no-print sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <TopbarTitle title={title} />
      <div className="flex shrink-0 items-center gap-3">
        <Link href="/todos" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="My to-dos">
          <Bell className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          <Avatar name={user.name} />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-slate-900">{user.name}</p>
            <Badge status={user.role} className="mt-0.5 !px-1.5 !py-0 text-[10px]" />
          </div>
        </div>
        <form action="/logout" method="post">
          <button type="submit" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
