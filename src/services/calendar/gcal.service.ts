import { env } from '../../config/env.js';
import { google } from 'googleapis';
import { logger } from '../../utils/logger.js';

export interface TimeSlot {
  id: string;
  start: string;
  end: string;
}

export class GoogleCalendarService {
  private readonly oauth2 = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
  );

  private hasCalendarCredentials(): boolean {
    return Boolean(env.GOOGLE_REFRESH_TOKEN);
  }

  private getRefreshToken(): string | null {
    return env.GOOGLE_REFRESH_TOKEN ?? null;
  }

  public async getAvailableSlots(): Promise<TimeSlot[]> {
    if (!this.hasCalendarCredentials()) {
      return this.getFallbackSlots();
    }
    try {
      this.oauth2.setCredentials({ refresh_token: this.getRefreshToken() });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2 });
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const busyResponse = await calendar.freebusy.query({
        requestBody: {
          timeMin: now.toISOString(),
          timeMax: inSevenDays.toISOString(),
          timeZone: env.GOOGLE_CALENDAR_TIMEZONE,
          items: [{ id: env.GOOGLE_CALENDAR_ID }],
        },
      });
      const busy = busyResponse.data.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy ?? [];

      const slots: TimeSlot[] = [];
      for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
        const day = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        for (const hour of [14, 15, 16]) {
          for (const minute of [0, 30]) {
            const start = new Date(day);
            start.setHours(hour, minute, 0, 0);
            const end = new Date(start.getTime() + 30 * 60 * 1000);
            const overlaps = busy.some((b) => {
              const bStart = b.start ? Date.parse(b.start) : Number.NaN;
              const bEnd = b.end ? Date.parse(b.end) : Number.NaN;
              if (Number.isNaN(bStart) || Number.isNaN(bEnd)) return false;
              return start.getTime() < bEnd && end.getTime() > bStart;
            });
            if (!overlaps) {
              slots.push({
                id: `slot_${start.getTime()}`,
                start: start.toISOString(),
                end: end.toISOString(),
              });
            }
            if (slots.length >= 6) return slots;
          }
        }
      }
      return slots;
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar slot lookup failed, using fallback slots');
      return this.getFallbackSlots();
    }
  }

  public async bookSlot(slotStartIso: string, slotEndIso: string, leadEmail: string): Promise<{
    eventId: string | null;
    meetLink: string | null;
  }> {
    if (!this.hasCalendarCredentials()) {
      return { eventId: null, meetLink: null };
    }
    try {
      this.oauth2.setCredentials({ refresh_token: this.getRefreshToken() });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2 });
      const response = await calendar.events.insert({
        calendarId: env.GOOGLE_CALENDAR_ID,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          summary: 'Orion Path consultation',
          description: 'Lead consultation booked via Orion Path bot.',
          start: {
            dateTime: slotStartIso,
            timeZone: env.GOOGLE_CALENDAR_TIMEZONE,
          },
          end: {
            dateTime: slotEndIso,
            timeZone: env.GOOGLE_CALENDAR_TIMEZONE,
          },
          attendees: [{ email: leadEmail }],
          conferenceData: {
            createRequest: {
              requestId: `orion-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      });
      const event = response.data;
      return {
        eventId: event.id ?? null,
        meetLink: event.hangoutLink ?? null,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Google Calendar booking failed');
      return { eventId: null, meetLink: null };
    }
  }

  private getFallbackSlots(): TimeSlot[] {
    // Safe fallback for local/test when calendar OAuth is unavailable.
    const now = new Date();
    return Array.from({ length: 6 }).map((_, i) => {
      const start = new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      start.setHours(14, 0, 0, 0);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      return { id: `slot_${i + 1}`, start: start.toISOString(), end: end.toISOString() };
    });
  }
}

