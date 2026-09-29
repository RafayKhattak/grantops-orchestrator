import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { formatWhen } from "@/lib/format";
import { listApprovals } from "@/server/queries";

export default async function ApprovalsPage() {
  const items = await listApprovals();
  return (
    <div>
      <PageHeader
        kicker="Review"
        title="Approvals"
        description="Grants waiting for a person. Approval stays blocked while a citation points outside the retrieved pages."
      />
      {items.length === 0 ? (
        <p className="py-16 text-sm text-faint">Nothing is waiting for review.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/grants/${item.id}`} className="block py-5 hover:bg-paper/70">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-medium tracking-tight text-ink">{item.title}</h2>
                  <span className="text-[12px] text-faint">{formatWhen(item.updatedAt)}</span>
                </div>
                <p className="mt-1 text-[13px] text-muted">{item.funder}</p>
                {item.excerpt ? (
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{item.excerpt}</p>
                ) : null}
                <p className="mt-3 text-[13px] text-ink">
                  Review draft{item.version ? ` v${item.version}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
