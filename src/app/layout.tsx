// deploy 2026-04-08T22:00
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { NotificationsListener } from "@/components/layout/NotificationsListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAYUS | Sistema Jurídico Premium",
  description: "O Sistema Operacional do Advogado Moderno",
};

import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background text-foreground transition-colors duration-500 antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <NotificationsListener />
          {children}
          <Toaster position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
