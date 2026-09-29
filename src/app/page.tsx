import Link from "next/link";
import { CreateGrantDialog } from "@/components/create-grant-dialog";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { KANBAN_COLUMNS } from "@/lib/domain/status";
import { formatWhen } from "@/lib/format";
import { syncDocDecisions } from "@/server/doc-decisions";
import { syncDriveFolder } from "@/server/drive-sync";
import { listGrantCards } from "@/server/queries";

export default async function HomePage() {
  await Promise.all([syncDriveFolder(), syncDocDecisions()]).catch(() => undefined);
  const grants = await listGrantCards();
  return (
    <div>
      <PageHeader
        kicker="Operations"
        title="Pipeline"
        description="Each card is a grant row. Status changes only when the workflow does."
        action={<CreateGrantDialog />}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
        {KANBAN_COLUMNS.map((column) => {
          const cards = grants.filter((grant) =>
            (column.statuses as readonly string[]).includes(grant.status),
          );
          return (
            <section key={column.id} className="min-w-0">
              <header className="mb-3 flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-medium text-ink">{column.title}</h2>
                <span className="text-[12px] tabular-nums text-faint">{cards.length}</span>
              </header>
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <p className="px-1 py-8 text-[13px] text-faint">Nothing here</p>
                ) : (
                  cards.map((grant) => (
                    <Link
                      key={grant.id}
                      href={`/grants/${grant.id}`}
                      className="block rounded-[10px] border border-line bg-paper px-4 py-3.5 transition hover:border-ink"
                    >
                      <StatusBadge status={grant.status} />
                      <h3 className="mt-2 text-[15px] font-medium leading-5 tracking-tight text-ink">
                        {grant.title}
                      </h3>
                      <p className="mt-1 text-[13px] text-muted">{grant.funder}</p>
                      <p className="mt-3 text-[12px] text-faint">
                        {grant.documentCount} document{grant.documentCount === 1 ? "" : "s"}
                        <span className="px-1.5">·</span>
                        {formatWhen(grant.updatedAt)}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
