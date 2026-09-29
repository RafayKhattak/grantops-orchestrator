"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileUp, Files, LayoutDashboard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Pipeline", icon: LayoutDashboard },
  { href: "/ingest", label: "Ingestion", icon: FileUp },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/records", label: "Client records", icon: Files },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-shell-muted hover:bg-shell-raised hover:text-shell-text",
              active && "bg-shell-raised text-shell-text",
            )}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
