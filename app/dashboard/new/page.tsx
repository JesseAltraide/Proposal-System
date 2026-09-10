import { requireRole } from "@/lib/auth";
import { BackLink } from "@/app/components/BackLink";
import { NewProposalForm } from "./NewProposalForm";

export default async function NewProposalPage() {
  const user = await requireRole("salesperson");
  return (
    <>
      <div className="mx-auto max-w-3xl">
        <BackLink href="/dashboard" label="My Proposals" />
      </div>
      <NewProposalForm salespersonName={user.fullName} />
    </>
  );
}
