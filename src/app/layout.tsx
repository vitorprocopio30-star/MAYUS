import type { Metadata } from "next";
import { Toaster } from "sonner";
import { NotificationsListener } from "@/components/layout/NotificationsListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAYUS - Painel Admin",
  description: "Acesso restrito à plataforma MAYUS",
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <ThemeProvider>
          <NotificationsListener />
          {children}
          <Toaster position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
