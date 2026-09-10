import "server-only";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatFullName } from "@/lib/names";
import type { Database, SectionKey } from "@/lib/supabase/database.types";

type Proposal = Database["public"]["Tables"]["proposals"]["Row"];
type Section = Database["public"]["Tables"]["proposal_sections"]["Row"];

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, lineHeight: 1.5, fontFamily: "Helvetica" },
  title: { fontSize: 20, marginBottom: 4 },
  meta: { fontSize: 10, color: "#555", marginBottom: 2 },
  section: { marginTop: 18 },
  heading: { fontSize: 13, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  body: { fontSize: 11 },
  footer: { marginTop: 28, fontSize: 11, color: "#333" },
});

const TEMPLATE_SECTIONS: { key: SectionKey; heading: string }[] = [
  { key: "introduction", heading: "1. Introduction" },
  { key: "proposed_solution", heading: "2. Proposed Solution" },
  { key: "deliverables", heading: "3. Deliverables" },
  { key: "timeline", heading: "4. Timeline" },
  { key: "pricing", heading: "5. Pricing" },
  { key: "next_steps", heading: "6. Next Steps" },
];

function ProposalPdfDocument({ proposal, sections }: { proposal: Proposal; sections: Section[] }) {
  const byKey = new Map(sections.map((s) => [s.section_key, s]));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          Proposal for {formatFullName(proposal.client_first_name ?? "", proposal.client_last_name ?? "")}
        </Text>
        <Text style={styles.meta}>Prepared by {proposal.salesperson_name}</Text>
        <Text style={styles.meta}>
          Date: {proposal.date_of_call ? new Date(proposal.date_of_call).toLocaleDateString() : ""}
        </Text>

        {TEMPLATE_SECTIONS.map(({ key, heading }) => (
          <View key={key} style={styles.section}>
            <Text style={styles.heading}>{heading}</Text>
            <Text style={styles.body}>{byKey.get(key)?.content ?? ""}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text>Warm regards,</Text>
          <Text>{proposal.salesperson_name}</Text>
          <Text>Koya Talent</Text>
        </View>
      </Page>
    </Document>
  );
}

// Decision #27 (progress.md): @react-pdf/renderer over puppeteer - lighter
// dependency, no headless-Chromium hosting concern, sufficient layout
// control for this structured document; trade-off is less layout/styling
// flexibility than reusing raw HTML/CSS.
export async function renderProposalPdf(proposal: Proposal, sections: Section[]): Promise<Buffer> {
  return renderToBuffer(<ProposalPdfDocument proposal={proposal} sections={sections} />);
}
