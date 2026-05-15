"use client";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { MAYUSOrb } from "@/components/dashboard/MAYUSOrb";
import { OrbStateProvider } from "@/components/dashboard/mayus-orb/OrbStateProvider";
import { useEffect, useState, type CSSProperties } from "react";

const DEFAULT_SIDEBAR_OFFSET = "280px";

function readSidebarOffset() {
  if (typeof document === "undefined") return DEFAULT_SIDEBAR_OFFSET;

  return (
    document.documentElement.dataset.mayusSidebarOffset ||
    document.documentElement.style.getPropertyValue("--mayus-sidebar-offset").trim() ||
    DEFAULT_SIDEBAR_OFFSET
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOffset, setSidebarOffset] = useState(DEFAULT_SIDEBAR_OFFSET);

  useEffect(() => {
    const syncSidebarOffset = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { width?: string } : null;
      setSidebarOffset(detail?.width || readSidebarOffset());
    };

    syncSidebarOffset();
    window.addEventListener("mayus-sidebar-mode-change", syncSidebarOffset);

    return () => {
      window.removeEventListener("mayus-sidebar-mode-change", syncSidebarOffset);
    };
  }, []);

  return (
    <OrbStateProvider>
    <div className="min-h-screen flex bg-white dark:bg-[#030303] text-white/90 transition-all duration-300 overflow-x-hidden">
      
      {/* Sidebar Fixa à Esquerda */}
      <AdminSidebar />
      
      {/* Container Principal */}
      <div
        className="flex-1 min-w-0 flex flex-col md:ml-[var(--mayus-dashboard-sidebar-offset)] min-h-screen transition-[margin] duration-300 ease-in-out"
        style={{ "--mayus-dashboard-sidebar-offset": sidebarOffset } as CSSProperties}
      >
        
        {/* Top Header */}
        <AdminHeader />

        {/* Home/Content de Cada Tela */}
        <main className="flex-1 min-w-0 p-4 md:p-8 overflow-x-hidden relative">
        {/* Orbe Flutuante (Maya) */}
        <MAYUSOrb />

        {children}
        </main>
        
      </div>
    </div>
    </OrbStateProvider>
  );
}
