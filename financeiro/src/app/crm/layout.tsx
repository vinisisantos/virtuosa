import { DashboardShell } from "@/components/crm-layout/dashboard-shell";

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
