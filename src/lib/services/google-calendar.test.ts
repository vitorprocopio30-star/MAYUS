import { describe, expect, it } from "vitest";
import {
  getGoogleCalendarDayWindow,
  getGoogleCalendarGlobalProvider,
  getGoogleCalendarProviderForUser,
  getGoogleCalendarSetupInfo,
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

  it("gera diagnostico de setup sem expor segredo OAuth", () => {
    const previousClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const previousGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    const previousGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const setup = getGoogleCalendarSetupInfo(new Request("https://app.example.com/dashboard/agenda"));

    expect(setup.configured).toBe(false);
    expect(setup.missingEnv).toEqual(expect.arrayContaining([
      "GOOGLE_CALENDAR_CLIENT_ID or GOOGLE_CLIENT_ID",
      "GOOGLE_CALENDAR_CLIENT_SECRET or GOOGLE_CLIENT_SECRET",
    ]));
    expect(setup.redirectUris.personal).toBe("https://app.example.com/api/integrations/google-calendar/callback");
    expect(setup.redirectUris.global).toBe("https://app.example.com/api/integrations/google-calendar-global/callback");
    expect(JSON.stringify(setup)).not.toMatch(/secret-value|client-secret/i);

    if (previousClientId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previousClientSecret;
    if (previousGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousGoogleClientId;
    if (previousGoogleClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousGoogleClientSecret;
  });
});
