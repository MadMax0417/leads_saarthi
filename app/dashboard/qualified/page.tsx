import DashboardContent, { type DashboardSearchParams } from "@/app/dashboard/dashboard-content";

export default async function QualifiedLeadsPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  return <DashboardContent view="qualified" searchParams={searchParams} />;
}