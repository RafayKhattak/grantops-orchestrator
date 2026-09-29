import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
      <div className="min-w-0">
        {kicker ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">{kicker}</p>
        ) : null}
        <h1 className="display mt-2 text-[2.35rem] leading-none text-ink">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
