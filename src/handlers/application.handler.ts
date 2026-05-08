import type { AppContext } from '../types/bot-context.js';
import {
  APPLICATION_STATUSES,
  ApplicationTrackerService,
  type ApplicationStatus,
} from '../services/tracker/application-tracker.service.js';

const tracker = new ApplicationTrackerService();
const APPLICATION_PAGE_SIZE = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function maybeHandleApplicationCommands(ctx: AppContext): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;
  if (!ctx.state.user) return false;
  const text = ctx.message.text.trim();

  if (text.startsWith('/applied')) {
    const payload = text.replace('/applied', '').trim();
    const [companyPart, rolePart] = payload.split('|').map((v) => v?.trim() ?? '');
    if (!companyPart || !rolePart) {
      await ctx.reply('Usage: /applied Company | Role');
      return true;
    }
    await tracker.addApplication({
      userId: ctx.state.user.id,
      company: companyPart,
      role: rolePart,
    });
    await ctx.reply(`Tracked application: ${companyPart} - ${rolePart}`);
    return true;
  }

  if (text.startsWith('/applications')) {
    const parts = text.split(/\s+/).filter(Boolean);
    const maybeStatus = parts[1]?.toLowerCase();
    const hasStatus = maybeStatus && APPLICATION_STATUSES.includes(maybeStatus as ApplicationStatus);
    const status = hasStatus ? (maybeStatus as ApplicationStatus) : undefined;
    const pageToken = hasStatus ? parts[2] : parts[1];
    const page = Math.max(1, Number.parseInt(pageToken ?? '1', 10) || 1);

    const { rows, total } = await tracker.listApplications(
      ctx.state.user.id,
      APPLICATION_PAGE_SIZE,
      page,
      status,
    );
    if (rows.length === 0) {
      await ctx.reply('No applications tracked yet.');
      return true;
    }
    const totalPages = Math.max(1, Math.ceil(total / APPLICATION_PAGE_SIZE));
    await ctx.reply(
      `Applications${status ? ` (${status})` : ''} - Page ${page}/${totalPages}\n\n${rows
        .map(
          (r, i) =>
            `${(page - 1) * APPLICATION_PAGE_SIZE + i + 1}. ${r.id} | ${r.company} | ${r.role} | ${r.status}${r.next_action_date ? ` | next: ${r.next_action_date}` : ''}${r.notes ? ` | note: ${r.notes.slice(0, 36)}` : ''}`,
        )
        .join('\n')}\n\nUsage: /applications [status] [page]`,
    );
    return true;
  }

  if (text.startsWith('/followup')) {
    const parts = text.split(/\s+/);
    const action = parts[1]?.toLowerCase();
    const appId = parts[2];
    if (!action || !appId || !['on', 'off'].includes(action)) {
      await ctx.reply('Usage: /followup {on|off} {application_id}');
      return true;
    }
    const updated = await tracker.setFollowUp(ctx.state.user.id, appId, action === 'on');
    if (!updated) {
      await ctx.reply('Application not found. Use /applications to list tracked entries.');
      return true;
    }
    await ctx.reply(`Follow-up reminders ${action === 'on' ? 'enabled' : 'disabled'} for ${appId}.`);
    return true;
  }

  if (text.startsWith('/appstatus')) {
    const parts = text.split(/\s+/);
    const appId = parts[1];
    const status = parts[2]?.toLowerCase() as ApplicationStatus | undefined;
    if (!appId || !status || !APPLICATION_STATUSES.includes(status)) {
      await ctx.reply(`Usage: /appstatus {application_id} {${APPLICATION_STATUSES.join('|')}}`);
      return true;
    }
    const updated = await tracker.setStatus(ctx.state.user.id, appId, status);
    if (!updated) {
      await ctx.reply('Application not found. Use /applications to list tracked entries.');
      return true;
    }
    await ctx.reply(`Application ${appId} moved to status "${status}".`);
    return true;
  }

  if (text.startsWith('/appnote')) {
    const parts = text.split(/\s+/);
    const appId = parts[1];
    const note = parts.slice(2).join(' ').trim();
    if (!appId || !note) {
      await ctx.reply('Usage: /appnote {application_id} {note text}');
      return true;
    }
    const updated = await tracker.setNotes(ctx.state.user.id, appId, note);
    if (!updated) {
      await ctx.reply('Application not found. Use /applications to list tracked entries.');
      return true;
    }
    await ctx.reply(`Saved note for ${appId}.`);
    return true;
  }

  if (text.startsWith('/appnext')) {
    const parts = text.split(/\s+/);
    const appId = parts[1];
    const dateValue = parts[2]?.toLowerCase();
    if (!appId || !dateValue) {
      await ctx.reply('Usage: /appnext {application_id} {YYYY-MM-DD|clear}');
      return true;
    }
    if (dateValue !== 'clear' && !DATE_RE.test(dateValue)) {
      await ctx.reply('Date must be YYYY-MM-DD or "clear".');
      return true;
    }
    const updated = await tracker.setNextActionDate(
      ctx.state.user.id,
      appId,
      dateValue === 'clear' ? null : dateValue,
    );
    if (!updated) {
      await ctx.reply('Application not found. Use /applications to list tracked entries.');
      return true;
    }
    await ctx.reply(
      dateValue === 'clear'
        ? `Cleared next-action date for ${appId}.`
        : `Set next-action date for ${appId} to ${dateValue}.`,
    );
    return true;
  }

  return false;
}

