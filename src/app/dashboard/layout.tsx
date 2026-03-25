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
    <div className="min-h-screen flex bg-[#030303] text-white/90 transition-all duration-300">
      
      {/* Sidebar Fixa à Esquerda */}
      <AdminSidebar />
      
      {/* Container Principal (margem para a barra lateral no desktop e sem margem no mobile) */}
      <div className="flex-1 flex flex-col md:ml-[280px] min-h-screen">
        
        {/* Top Header */}
        <AdminHeader />

        {/* Home/Content de Cada Tela */}
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden relative">
          {/* Assistente Inteligente MAYUS Global (ElevenLabs Oficial) */}
          <div className="fixed bottom-6 right-6 z-50">
            <MAYUSOrb />
          </div>

          {children}
        </main>
        
      </div>
    </div>
  );
}
