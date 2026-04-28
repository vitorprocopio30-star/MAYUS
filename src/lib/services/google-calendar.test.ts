import { describe, expect, it } from "vitest";
import {
  getGoogleCalendarDayWindow,
  getGoogleCalendarGlobalProvider,
  getGoogleCalendarProviderForUser,
  mapGoogleCalendarEvent,
  sanitizeGoogleCalendarState,
} from "@/lib/services/google-calendar";

describe("google-calendar service", () => {
  it("escopa provider por usuario", () => {
    expect(getGoogleCalendarProviderForUser("user-123")).toBe("google_calendar_user:user-123");
  });

  it("usa provider separado para agenda global", () => {
    expect(getGoogleCalendarGlobalProvider()).toBe("google_calendar_global");
  });

  it("normaliza janela diaria para consulta do Google Calendar", () => {
    expect(getGoogleCalendarDayWindow("2026-04-28")).toEqual({
      timeMin: "2026-04-28T00:00:00-03:00",
      timeMax: "2026-04-28T23:59:59-03:00",
    });
  });

  it("mapeia evento do Google como item externo da agenda MAYUS", () => {
    const event = mapGoogleCalendarEvent({
      id: "abc123",
      summary: "Reuniao com cliente",
      description: "Alinhamento inicial",
      htmlLink: "https://calendar.google.com/event?eid=abc123",
      start: { dateTime: "2026-04-28T13:30:00.000Z" },
      end: { dateTime: "2026-04-28T14:00:00.000Z" },
    });

    expect(event).toMatchObject({
      id: "google-calendar-abc123",
      source_table: "google_calendar",
      source_id: "abc123",
      title: "Reuniao com cliente",
      type: "Google Agenda",
      status: "Pendente",
      visibility: "private",
      is_external_calendar: true,
      reward_coins: 0,
    });
    expect(event?.html_link).toContain("calendar.google.com");
  });

  it("sanitiza estado sem expor access token ou refresh token", () => {
    const state = sanitizeGoogleCalendarState({
      status: "connected",
      api_key: "refresh-secret",
      metadata: {
        access_token: "access-secret",
        connected_email: "camila@example.com",
        expires_at: "2026-04-28T13:00:00.000Z",
      },
    });

    expect(state).toEqual({
      available: true,
      connected: true,
      status: "connected",
      connectedEmail: "camila@example.com",
      events: [],
    });
    expect(JSON.stringify(state)).not.toMatch(/secret|access_token|api_key|refresh/i);
  });
});
