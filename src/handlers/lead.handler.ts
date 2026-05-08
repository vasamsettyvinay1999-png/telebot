import { Markup } from 'telegraf';
import type { AppContext } from '../types/bot-context.js';
import { GoogleCalendarService } from '../services/calendar/gcal.service.js';
import { LeadService } from '../services/leads/lead.service.js';
import { EmailNotifier } from '../services/notifications/email.notifier.js';

const leadService = new LeadService();
const calendarService = new GoogleCalendarService();
const emailNotifier = new EmailNotifier();

const leadPatterns = [/pricing/i, /staffing/i, /our company/i, /hire/i, /services/i];

export async function maybeHandleLeadFlow(ctx: AppContext): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text;
  if (!leadPatterns.some((p) => p.test(text))) return false;
  if (!ctx.from?.id) return false;

  await leadService.upsertLead(ctx.from.id, ctx.from.username ?? null);
  await leadService.addSignal(ctx.from.id, 'lead_inquiry', 5);
  const slots = await calendarService.getAvailableSlots();
  ctx.session.tempData.leadSlots = slots;
  const buttons = slots.slice(0, 6).map((slot) => [
    Markup.button.callback(
      new Date(slot.start).toLocaleString(),
      `lead:slot:${slot.id}`,
    ),
  ]);
  await ctx.reply(
    'Want to schedule a 15-minute call to talk through how we can help you? Here are available times:',
    Markup.inlineKeyboard(buttons),
  );
  return true;
}

export async function maybeHandleLeadCallback(ctx: AppContext): Promise<boolean> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return false;
  if (!ctx.callbackQuery.data.startsWith('lead:slot:')) return false;
  await ctx.answerCbQuery('Slot selected');
  const selectedSlotId = ctx.callbackQuery.data.replace('lead:slot:', '');
  const slots = Array.isArray(ctx.session.tempData.leadSlots)
    ? (ctx.session.tempData.leadSlots as Array<{ id: string; start: string; end: string }>)
    : [];
  const selectedSlot = slots.find((s) => s.id === selectedSlotId);
  if (!selectedSlot) {
    await ctx.reply('That slot is no longer available. Please request slots again.');
    return true;
  }
  await ctx.reply(
    `Great! Selected: ${new Date(selectedSlot.start).toLocaleString()}.\nTo confirm your booking, what's your email address?`,
  );
  ctx.session.currentFlow = 'lead_booking_email';
  ctx.session.pendingConfirmation = selectedSlot.id;
  return true;
}

export async function maybeHandleLeadEmailStep(ctx: AppContext): Promise<boolean> {
  if (ctx.session.currentFlow !== 'lead_booking_email') return false;
  if (!ctx.message || !('text' in ctx.message)) return true;
  const email = ctx.message.text.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await ctx.reply('Please provide a valid email address.');
    return true;
  }
  const selectedSlotId = ctx.session.pendingConfirmation;
  const slots = Array.isArray(ctx.session.tempData.leadSlots)
    ? (ctx.session.tempData.leadSlots as Array<{ id: string; start: string; end: string }>)
    : [];
  const selectedSlot = slots.find((s) => s.id === selectedSlotId);
  if (!selectedSlot) {
    await ctx.reply('Your selected slot expired. Please start again to pick a slot.');
    ctx.session.currentFlow = null;
    ctx.session.pendingConfirmation = null;
    return true;
  }

  const booking = await calendarService.bookSlot(selectedSlot.start, selectedSlot.end, email);
  await emailNotifier.sendBookingConfirmation({
    email,
    startIso: selectedSlot.start,
    endIso: selectedSlot.end,
    meetLink: booking.meetLink,
    details: 'Thank you for booking with Orion Path.',
  });
  await ctx.reply(`✅ Booked! Confirmation sent to ${email}`);
  ctx.session.currentFlow = null;
  ctx.session.pendingConfirmation = null;
  delete ctx.session.tempData.leadSlots;
  return true;
}

