"use client";

import { useCallback, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import AuthGuard from "@/components/auth-guard";
import { CrmViewportSync } from "./viewport-sync";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <AuthGuard>
      <CrmViewportSync />
      <div className="crm-viewport-lock flex bg-background">
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Header onOpenSidebar={() => setSidebarOpen(true)} />
          <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="crm-shell-content h-full min-h-0 overflow-y-auto px-3 py-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
