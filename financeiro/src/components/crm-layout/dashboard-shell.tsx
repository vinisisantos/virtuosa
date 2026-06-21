"use client";

import { useCallback, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import AuthGuard from "@/components/auth-guard";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <AuthGuard>
      <div className="crm-viewport-lock flex bg-background">
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onOpenSidebar={() => setSidebarOpen(true)} />
          <main className="relative flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
