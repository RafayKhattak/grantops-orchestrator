import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { STATUS_LABELS } from "@/lib/domain/status";
import { formatHours, formatWhen } from "@/lib/format";
import { getReport } from "@/server/queries";

export default async function ReportsPage() {
  const report = await getReport();
  return (
    <div className="space-y-10">
      <PageHeader
        kicker={report.organizationName}
        title="Reports"
        description={`Counts and cycle time come from the status log. This database has ${report.organizationCount} organizations. This workspace loads one of them.`}
      />

      <div className="grid gap-8 sm:grid-cols-3">
        <Metric label="Visible grants" value={String(report.visibleGrants)} />
        <Metric label="Awaiting review" value={String(report.awaitingReview)} />
        <Metric
          label="Average time to export"
          value={report.averageExportHours === null ? "—" : formatHours(report.averageExportHours)}
        />
      </div>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Lifecycle</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[12px] text-faint">
            <tr>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Grants</th>
            </tr>
          </thead>
          <tbody>
            {report.byStatus.map((row) => (
              <tr key={row.status} className="border-t border-line">
                <td className="py-2.5">{STATUS_LABELS[row.status]}</td>
                <td className="py-2.5 text-right tabular-nums">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Fact checks</h2>
        <p className="mt-3 text-sm text-ink">
          Passed {report.factChecks.passed}
          <span className="px-2 text-faint">/</span>
          Failed {report.factChecks.failed}
          <span className="px-2 text-faint">/</span>
          Unchecked {report.factChecks.unchecked}
        </p>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
          Other organizations
        </h2>
        <p className="mt-2 text-sm text-muted">Names and grant counts. Titles and documents stay unloaded.</p>
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
          {report.excludedOrganizations.map((organization) => (
            <li key={organization.name} className="flex justify-between py-3">
              <span>{organization.name}</span>
              <span className="tabular-nums text-muted">
                {organization.grantCount} excluded
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Visible grants</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[12px] text-faint">
            <tr>
              <th className="py-2 font-medium">Grant</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Drafts</th>
              <th className="py-2 font-medium">Fact check</th>
              <th className="py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {report.grants.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-faint">
                  No grants in this workspace.
                </td>
              </tr>
            ) : (
              report.grants.map((grant) => (
                <tr key={grant.id} className="border-t border-line">
                  <td className="py-3">
                    <Link href={`/grants/${grant.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
                      {grant.title}
                    </Link>
                    <div className="text-[12px] text-faint">{grant.funder}</div>
                  </td>
                  <td className="py-3">{STATUS_LABELS[grant.status]}</td>
                  <td className="py-3 tabular-nums">{grant.draftCount}</td>
                  <td className="py-3 capitalize">{grant.latestFactCheck}</td>
                  <td className="py-3 text-muted">{formatWhen(grant.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className="display mt-2 text-[2.75rem] leading-none text-ink">{value}</p>
    </div>
  );
}
