import { formatFullName } from "@/lib/names";
import type { Database, SectionKey } from "@/lib/supabase/database.types";

type Proposal = Database["public"]["Tables"]["proposals"]["Row"];
type Section = Database["public"]["Tables"]["proposal_sections"]["Row"];

// Renders the finished proposal exactly as a client would eventually see
// it - no scanty indicators, no comparison view, no system-generated flags
// of any kind (full-flow.md Stage 5 / build-spec's approval flow section).
// This is the same visual structure the PDF generator (lib/pdf.tsx) follows.
export function ProposalDocument({
  proposal,
  sections,
}: {
  proposal: Proposal;
  sections: Section[];
}) {
  const byKey = new Map(sections.map((s) => [s.section_key, s]));
  const content = (key: SectionKey) => byKey.get(key)?.content ?? "";

  return (
    <article className="mx-auto max-w-3xl space-y-8 rounded-lg border border-neutral-200 bg-white p-10 text-neutral-900">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-2xl font-semibold">
          Proposal for {formatFullName(proposal.client_first_name ?? "", proposal.client_last_name ?? "")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Prepared by {proposal.salesperson_name}</p>
        <p className="text-sm text-neutral-500">
          Date: {proposal.date_of_call ? new Date(proposal.date_of_call).toLocaleDateString() : ""}
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">1. Introduction</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content("introduction")}</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">2. Proposed Solution</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content("proposed_solution")}</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">3. Deliverables</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content("deliverables")}</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">4. Timeline</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content("timeline")}</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">5. Pricing</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content("pricing")}</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">6. Next Steps</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{content("next_steps")}</p>
      </section>

      <footer className="border-t border-neutral-200 pt-6 text-sm text-neutral-600">
        <p>Warm regards,</p>
        <p>{proposal.salesperson_name}</p>
        <p>Koya Talent</p>
      </footer>
    </article>
  );
}
