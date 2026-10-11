import DashboardContent, { type DashboardSearchParams } from "@/app/dashboard/dashboard-content";

export default async function UnqualifiedLeadsPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  return <DashboardContent view="unqualified" searchParams={searchParams} />;
}