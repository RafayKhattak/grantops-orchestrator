import { Nav } from "@/components/nav";

export function Sidebar({ organizationName }: { organizationName: string }) {
  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col bg-shell px-4 py-6 text-shell-text">
      <div className="px-2.5 pb-8">
        <p className="display text-[1.65rem] leading-none text-shell-text">GrantOps</p>
        <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-shell-muted">Grant lifecycle</p>
      </div>
      <Nav />
      <div className="mt-auto border-t border-white/10 px-2.5 pt-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-shell-muted">Workspace</p>
        <p className="mt-2 text-[13px] leading-5 break-words text-shell-text">{organizationName}</p>
        <form action="/api/auth/logout" method="post" className="mt-4">
          <button type="submit" className="text-[12px] text-shell-muted hover:text-shell-text">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
