"use client";

import { Settings } from "lucide-react";
import CloudModeBadge from "./cloud-mode-badge";

interface SidebarProfileCardProps {
  profileName: string;
  onOpenSettings: () => void;
}

function getInitial(profileName: string): string {
  const trimmed = profileName.trim();
  if (!trimmed) return "M";
  return trimmed.charAt(0).toLocaleUpperCase("tr-TR");
}

export default function SidebarProfileCard({
  profileName,
  onOpenSettings,
}: SidebarProfileCardProps) {
  const initial = getInitial(profileName);

  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3 shadow-sm shadow-black/20">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-violet-400 text-sm font-bold text-zinc-950 shadow-sm shadow-amber-950/30">
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-[13px] font-semibold leading-tight text-zinc-50">
              {profileName}
            </p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-zinc-800/70 bg-zinc-950/35 text-zinc-500 transition-colors hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-amber-200 cursor-pointer"
              aria-label="Ayarları aç"
              title="Ayarları aç"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 max-w-full overflow-hidden">
            <CloudModeBadge />
          </div>
        </div>
      </div>
    </div>
  );
}
