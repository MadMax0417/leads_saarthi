import DashboardContent, { type DashboardSearchParams } from "@/app/dashboard/dashboard-content";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  return <DashboardContent view="all" searchParams={searchParams} />;
}