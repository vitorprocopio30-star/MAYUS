// deploy 2026-04-08T22:00
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { NotificationsListener } from "@/components/layout/NotificationsListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAYUS | Sistema Jurídico Premium",
  description: "O Sistema Operacional do Advogado Moderno",
};

import { Inter, Montserrat, Cormorant_Garamond } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["300", "400", "500", "600", "700", "800", "900"]
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"]
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${montserrat.variable} ${cormorant.variable} font-sans min-h-screen bg-background text-foreground transition-colors duration-500 antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <NotificationsListener />
          {children}
          <Toaster position="top-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
