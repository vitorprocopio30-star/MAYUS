"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { DemoEnvironmentBanner } from "@/components/layout/DemoEnvironmentBanner";
import { MAYUSOrb } from "@/components/dashboard/MAYUSOrb";

type SidebarMode = "expanded" | "mini" | "hidden";

const SIDEBAR_STORAGE_KEY = "mayus_sidebar_mode";

function normalizeSidebarMode(value: unknown): SidebarMode {
  if (value === "mini" || value === "hidden" || value === "expanded") return value;
  return "expanded";
}

function getSidebarOffset(mode: SidebarMode) {
  if (mode === "mini") return "80px";
  if (mode === "hidden") return "0px";
  return "280px";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    if (typeof window === "undefined") return "expanded";
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return normalizeSidebarMode(saved);
  });
  const sidebarOffset = getSidebarOffset(sidebarMode);

  useEffect(() => {
    const syncSidebarMode = (mode?: unknown) => {
      const storedMode = mode ?? window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setSidebarMode(normalizeSidebarMode(storedMode));
    };

    syncSidebarMode();

    const handleModeChange = (event: Event) => {
      syncSidebarMode((event as CustomEvent<{ mode?: SidebarMode }>).detail?.mode);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === SIDEBAR_STORAGE_KEY) syncSidebarMode(event.newValue);
    };

    window.addEventListener("mayus-sidebar-mode-change", handleModeChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("mayus-sidebar-mode-change", handleModeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return (
    <div
      className="min-h-screen flex bg-white dark:bg-[#030303] text-white/90 transition-all duration-300"
    >
      
      {/* Sidebar Fixa à Esquerda */}
      <AdminSidebar />
      
      {/* Container Principal */}
      <div
        className={`mayus-dashboard-shell flex flex-col min-h-screen min-w-0 transition-all duration-300 ease-in-out is-${sidebarMode}`}
        style={{
          "--mayus-dashboard-sidebar-offset": `var(--mayus-sidebar-offset, ${sidebarOffset})`,
        } as CSSProperties}
        data-sidebar-mode={sidebarMode}
        data-sidebar-offset={sidebarOffset}
      >
        
        {/* Top Header */}
        <AdminHeader />

        {/* Home/Content de Cada Tela */}
        <main className="mayus-dashboard-main flex-1 p-4 md:p-8 overflow-x-hidden relative">
        {/* Orbe Flutuante (Maya) */}
        <MAYUSOrb />

        <DemoEnvironmentBanner />
        {children}
        </main>
        
      </div>
      <style jsx global>{`
        :root {
          --mayus-dashboard-sidebar-offset: 0px;
        }
        .mayus-dashboard-shell {
          margin-left: 0;
          width: 100dvw;
          max-width: 100dvw;
        }
        @media (min-width: 768px) {
          .mayus-dashboard-shell {
            margin-left: var(--mayus-dashboard-sidebar-offset) !important;
            width: calc(100dvw - var(--mayus-dashboard-sidebar-offset)) !important;
            max-width: calc(100dvw - var(--mayus-dashboard-sidebar-offset)) !important;
          }
        }
      `}</style>
    </div>
  );
}
