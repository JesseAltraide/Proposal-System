import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/app/components/StatusBadge";
import { formatFullName } from "@/lib/names";
import type { ProposalStatus } from "@/lib/supabase/database.types";

export default async function ApprovalsQueuePage() {
  const supabase = await createClient();
  const { data: proposals } = await supabase
    .from("proposals")
    .select("id, company_name, client_first_name, client_last_name, salesperson_name, status, updated_at")
    .in("status", ["pending_approval", "reproposal_sent"])
    .order("updated_at", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-neutral-900">Approval Queue</h1>
        {!proposals || proposals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            Nothing pending approval.
          </p>
        ) : (
          <QueueTable proposals={proposals} hrefBase="/approvals" />
        )}
      </div>
    </div>
  );
}

function QueueTable({
  proposals,
  hrefBase,
}: {
  proposals: {
    id: string;
    company_name: string | null;
    client_first_name: string | null;
    client_last_name: string | null;
    salesperson_name: string | null;
    status: ProposalStatus;
    updated_at: string;
  }[];
  hrefBase: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Salesperson</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Waiting since</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => (
            <tr key={p.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
              <td className="px-4 py-3">
                <Link href={`${hrefBase}/${p.id}`} prefetch={false} className="font-medium text-neutral-900 hover:underline">
                  {p.company_name || "(untitled)"}
                </Link>
              </td>
              <td className="px-4 py-3 text-neutral-600">
                {formatFullName(p.client_first_name ?? "", p.client_last_name ?? "")}
              </td>
              <td className="px-4 py-3 text-neutral-600">{p.salesperson_name}</td>
              <td className="px-4 py-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-4 py-3 text-neutral-500">{new Date(p.updated_at).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`${hrefBase}/${p.id}`}
                  prefetch={false}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  View Proposal
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
