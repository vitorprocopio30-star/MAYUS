"use client";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { MAYUSOrb } from "@/components/dashboard/MAYUSOrb";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex bg-white dark:bg-[#030303] text-white/90 transition-all duration-300"
    >
      
      {/* Sidebar Fixa à Esquerda */}
      <AdminSidebar />
      
      {/* Container Principal */}
      <div
        className="mayus-dashboard-shell flex flex-col min-h-screen min-w-0 transition-all duration-300 ease-in-out"
        style={{
          marginLeft: "var(--mayus-dashboard-sidebar-offset, 0px)",
          width: "calc(100dvw - var(--mayus-dashboard-sidebar-offset, 0px))",
          maxWidth: "calc(100dvw - var(--mayus-dashboard-sidebar-offset, 0px))",
        }}
      >
        
        {/* Top Header */}
        <AdminHeader />

        {/* Home/Content de Cada Tela */}
        <main className="mayus-dashboard-main flex-1 p-4 md:p-8 overflow-x-hidden relative">
        {/* Orbe Flutuante (Maya) */}
        <MAYUSOrb />

        {children}
        </main>
        
      </div>
      <style jsx global>{`
        :root {
          --mayus-dashboard-sidebar-offset: 0px;
        }
        @media (min-width: 768px) {
          :root {
            --mayus-dashboard-sidebar-offset: var(--mayus-sidebar-offset, 280px);
          }
          html[data-mayus-sidebar-mode="mini"] .mayus-dashboard-shell,
          body[data-mayus-sidebar-mode="mini"] .mayus-dashboard-shell {
            margin-left: 80px !important;
            width: calc(100dvw - 80px) !important;
            max-width: calc(100dvw - 80px) !important;
          }
          html[data-mayus-sidebar-mode="hidden"] .mayus-dashboard-shell,
          body[data-mayus-sidebar-mode="hidden"] .mayus-dashboard-shell {
            margin-left: 0 !important;
            width: 100dvw !important;
            max-width: 100dvw !important;
          }
          html[data-mayus-sidebar-mode="hidden"] .mayus-dashboard-main,
          body[data-mayus-sidebar-mode="hidden"] .mayus-dashboard-main {
            padding-left: 1rem !important;
          }
          html[data-mayus-sidebar-mode="expanded"] .mayus-dashboard-shell,
          body[data-mayus-sidebar-mode="expanded"] .mayus-dashboard-shell {
            margin-left: 280px !important;
            width: calc(100dvw - 280px) !important;
            max-width: calc(100dvw - 280px) !important;
          }
        }
      `}</style>
    </div>
  );
}
