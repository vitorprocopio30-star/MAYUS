"use client";

import WhatsAppChatPremiumPage from "../whatsapp/page";

export default function TodasConversasPage() {
  return (
    <WhatsAppChatPremiumPage
      initialActiveTab="todas"
      initialFiltersOpen={false}
      pageTitle="Todas as conversas"
    />
  );
}
