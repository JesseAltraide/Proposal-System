import { requireRole } from "@/lib/auth";
import { NavBar } from "@/app/components/NavBar";

export default async function ApprovalsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("approver");

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <NavBar fullName={user.fullName} role={user.role} />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
