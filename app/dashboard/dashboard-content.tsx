import { KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import LeadsDashboard from "@/app/leads-dashboard";
import LeadTable from "@/app/lead-table";
import { logout } from "@/app/auth-actions";
import { requireUser } from "@/lib/auth";
import {
  getLeadCategories,
  getLeadSummary,
  getLeadsPage,
  getWorkspaceCounts,
  LEAD_DEFAULT_PAGE_SIZE,
  LEAD_PAGE_SIZES,
  type LeadFilter,
  type LeadView,
} from "@/lib/leads";

export type DashboardSearchParams = {
  [key: string]: string | string[] | undefined;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLeadQuery(params: DashboardSearchParams) {
  const rawPage = Number.parseInt(firstValue(params.page) ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawPageSize = Number.parseInt(firstValue(params.pageSize) ?? String(LEAD_DEFAULT_PAGE_SIZE), 10);
  const pageSize = (LEAD_PAGE_SIZES as readonly number[]).includes(rawPageSize)
    ? rawPageSize
    : LEAD_DEFAULT_PAGE_SIZE;

  const q = (firstValue(params.q) ?? "").trim().slice(0, 200);

  const rawCategory = firstValue(params.category) ?? "";
  const category = rawCategory && rawCategory !== "all" ? rawCategory.slice(0, 300) : "all";

  const rawFilter = firstValue(params.filter);
  const filter: LeadFilter = rawFilter === "phone" || rawFilter === "website" ? rawFilter : "all";

  return { page, pageSize, q, category, filter };
}

export default async function DashboardContent({ view, searchParams }: {
  view: LeadView;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const user = await requireUser();
  const canManageSales = user.role === "salesperson";
  if (canManageSales && view !== "qualified") redirect("/dashboard/qualified");

  const dataView: LeadView = canManageSales ? "qualified" : view;
  const query = parseLeadQuery(await searchParams);

  const [page, summary, counts, categories, loginTime] = await Promise.all([
    getLeadsPage(dataView, query),
    getLeadSummary(dataView),
    getWorkspaceCounts(),
    getLeadCategories(dataView),
    Promise.resolve(user.loginTimeInIST
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(user.loginTimeInIST)
      : "Not available"),
  ]);

  const table = page.rows.length ? (
    <LeadTable
      rows={page.rows}
      canReview={user.role === "reviewer"}
      canManageSales={canManageSales}
    />
  ) : null;

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
        activeView={view}
        canReview={user.role === "reviewer"}
        canManageSales={canManageSales}
        counts={counts}
        summary={summary}
        categories={categories}
        q={query.q}
        category={query.category}
        filter={query.filter}
        page={page.page}
        pageSize={page.pageSize}
        pageCount={page.pageCount}
        total={page.total}
      >
        {table}
      </LeadsDashboard>
    </>
  );
}