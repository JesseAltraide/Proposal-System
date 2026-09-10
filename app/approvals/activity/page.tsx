import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatFullName } from "@/lib/names";

// Decision #46: "a log for who approved what" - surfaces the existing
// approvals table (already had everything needed; this is a new UI, not a
// new data model).
export default async function ActivityLogPage() {
  const supabase = await createClient();

  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .order("decided_at", { ascending: false });

  const proposalIds = [...new Set((approvals ?? []).map((a) => a.proposal_id))];
  const approverIds = [...new Set((approvals ?? []).map((a) => a.approver_id))];

  const { data: proposals } = proposalIds.length
    ? await supabase.from("proposals").select("id, company_name").in("id", proposalIds)
    : { data: [] };
  const { data: approvers } = approverIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", approverIds)
    : { data: [] };

  const companyById = new Map((proposals ?? []).map((p) => [p.id, p.company_name]));
  const approverNameById = new Map(
    (approvers ?? []).map((p) => [p.id, formatFullName(p.first_name, p.last_name)]),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">Activity Log</h1>

      {!approvals || approvals.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          No decisions recorded yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Proposal</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Approver</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/approvals/view/${a.proposal_id}`} prefetch={false} className="font-medium text-neutral-900 hover:underline">
                      {companyById.get(a.proposal_id) || "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{a.decision}</td>
                  <td className="px-4 py-3 text-neutral-600">{approverNameById.get(a.approver_id) ?? "Unknown"}</td>
                  <td className="px-4 py-3 text-neutral-500">{a.note ?? " - "}</td>
                  <td className="px-4 py-3 text-neutral-500">{new Date(a.decided_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
