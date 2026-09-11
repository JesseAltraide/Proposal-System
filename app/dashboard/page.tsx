import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/app/components/StatusBadge";
import { ClientResponseBadge } from "@/app/components/ClientResponseBadge";
import { formatFullName } from "@/lib/names";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: proposals } = await supabase
    .from("proposals")
    .select(
      "id, company_name, client_first_name, client_last_name, status, client_response_status, sent_at, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">My Proposals</h1>
        <Link
          href="/dashboard/new"
          prefetch={false}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + New Proposal
        </Link>
      </div>

      {!proposals || proposals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          No proposals yet. Create your first one to get started.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Client Response</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/${p.id}`} prefetch={false} className="font-medium text-neutral-900 hover:underline">
                      {p.company_name || "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {formatFullName(p.client_first_name ?? "", p.client_last_name ?? "")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ClientResponseBadge
                      status={p.client_response_status}
                      proposalStatus={p.status}
                      sentAt={p.sent_at}
                    />
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {new Date(p.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/${p.id}`}
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
      )}
    </div>
  );
}
