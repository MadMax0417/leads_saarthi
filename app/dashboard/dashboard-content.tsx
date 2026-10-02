import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import LeadsDashboard from "@/app/leads-dashboard";
import { logout } from "@/app/auth-actions";
import { requireUser } from "@/lib/auth";
import { getLeads, type LeadView } from "@/lib/leads";

export default async function DashboardContent({ view }: { view: LeadView }) {
  const user = await requireUser();
  const canManageSales = user.role === "salesperson";
  if (canManageSales && view !== "qualified") redirect("/dashboard/qualified");

  const [businesses, loginTime] = await Promise.all([
    getLeads(canManageSales ? "qualified" : "all"),
    Promise.resolve(user.loginTimeInIST
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(user.loginTimeInIST)
      : "Not available"),
  ]);

  return (
    <>
      <div className="account-strip">
        <div className="account-summary">
          <span className="account-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <span>Signed in as <strong className="capitalize">{user.name}</strong></span>
          <span className="account-login-time">Last login {loginTime} IST</span>
        </div>
        <div className="account-actions">
          <Link href="/change-password"><KeyRound size={14} /> Change password</Link>
          <form action={logout}>
            <button type="submit"><LogOut size={14} /> Sign out</button>
          </form>
        </div>
      </div>
      <LeadsDashboard
        businesses={businesses}
        activeView={view}
        canReview={user.role === "reviewer"}
        canManageSales={canManageSales}
      />
    </>
  );
}