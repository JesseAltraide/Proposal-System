import { getGrantedRoles, requireRole } from "@/lib/auth";
import { NavBar } from "@/app/components/NavBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("salesperson");
  const grantedRoles = await getGrantedRoles(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <NavBar fullName={user.fullName} role={user.role} grantedRoles={grantedRoles} />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
