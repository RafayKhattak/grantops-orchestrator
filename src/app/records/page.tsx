import { PageHeader } from "@/components/page-header";
import { RecordForm } from "@/components/record-form";
import { listClientRecords } from "@/server/client-records";

export default async function RecordsPage() {
  const records = await listClientRecords();
  return (
    <div>
      <PageHeader
        kicker="Client file"
        title="Client records"
        description="Facts about this client only. Approval is blocked when a draft contradicts them."
      />
      {records.length === 0 ? (
        <p className="text-sm text-faint">No client records yet.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {records.map((record) => (
            <li key={record.id} className="py-4">
              <h2 className="text-[15px] font-medium text-ink">{record.title}</h2>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted">{record.body}</p>
            </li>
          ))}
        </ul>
      )}
      <RecordForm />
    </div>
  );
}
