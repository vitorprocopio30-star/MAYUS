"use client";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { MAYUSOrb } from "@/components/dashboard/MAYUSOrb";
import type { CSSProperties } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex bg-white dark:bg-[#030303] text-white/90 transition-all duration-300"
      style={{ "--mayus-sidebar-offset": "280px" } as CSSProperties}
    >
      
      {/* Sidebar Fixa à Esquerda */}
      <AdminSidebar />
      
      {/* Container Principal */}
      <div className="flex-1 flex flex-col md:ml-[var(--mayus-sidebar-offset)] min-h-screen transition-[margin] duration-300 ease-in-out">
        
        {/* Top Header */}
        <AdminHeader />

        {/* Home/Content de Cada Tela */}
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden relative">
        {/* Orbe Flutuante (Maya) */}
        <MAYUSOrb />

        {children}
        </main>
        
      </div>
    </div>
  );
}
