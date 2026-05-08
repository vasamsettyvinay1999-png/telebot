import { bot } from '../bot.js';
import { supabase } from '../config/supabase.js';
import { redis } from '../config/redis.js';
import { adminGuardMiddleware } from '../middleware/adminGuard.middleware.js';
import { queues } from '../queues/queue.registry.js';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '../services/tracker/application-tracker.service.js';
import { AdminAuditService } from '../services/admin/audit.service.js';
import { EscalationService } from '../services/support/escalation.service.js';
import { ApprovalService } from '../services/user/approval.service.js';
import { CreditsService } from '../services/user/credits.service.js';
import { UserService } from '../services/user/user.service.js';
import { defaultSessionState } from '../types/session.js';
import { logger } from '../utils/logger.js';

const userService = new UserService();
const approvalService = new ApprovalService();
const creditsService = new CreditsService();
const auditService = new AdminAuditService();
const escalationService = new EscalationService();
const APPS_PAGE_SIZE = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseId(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number.parseInt(input, 10);
  return Number.isNaN(n) ? null : n;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeCsv(value: string | null | undefined): string {
  const raw = value ?? '';
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

function formatEscalationCaseLine(row: {
  id: string;
  urgency: string;
  reason: string;
  source_message: string;
  assigned_admin_telegram_id?: number | null;
}): string {
  const assignee = row.assigned_admin_telegram_id ? ` | assignee:${row.assigned_admin_telegram_id}` : '';
  return `${row.id.slice(0, 8)}... | ${row.urgency}${assignee} | ${row.reason}\n${row.source_message.slice(0, 120)}`;
}

export function registerAdminHandlers(): void {
  bot.command('admin', adminGuardMiddleware, async (ctx) => {
    await ctx.reply(
      '/users [page]\n/user {telegram_id}\n/approve {telegram_id}\n/reject {telegram_id}\n/ban {telegram_id}\n/unban {telegram_id}\n/credits {telegram_id} {amount}\n/stats\n/costs [days]\n/queue\n/escalations [limit]\n/escalation {case_id}\n/escassign {case_id} {admin_telegram_id|me|clear}\n/escnote {case_id} {note}\n/apps [status] [page]\n/appdetail {application_id}\n/appsetstatus {application_id} {status}\n/appsetnext {application_id} {YYYY-MM-DD|clear}\n/appsbulkstatus {status} {id1,id2,...}\n/appsdue [days]\n/appsexport [status]\n/latestprep {telegram_id}\n/latestletter {telegram_id}\n/reply {telegram_id} {message}\n/resolve {case_id|telegram_id}\n/logs {telegram_id} [limit]\n/broadcast {message}',
    );
  });

  bot.command('users', adminGuardMiddleware, async (ctx) => {
    const pageArg = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '';
    const page = Math.max(1, parseId(pageArg) ?? 1);
    const users = await userService.listUsers(page, 10);
    if (users.length === 0) {
      await ctx.reply('No users found.');
      return;
    }
    const lines = users.map(
      (u, i) =>
        `${i + 1}. ${u.full_name ?? 'Unknown'} | @${u.telegram_username ?? '-'} | ${u.status} | ${u.daily_generation_count} gen`,
    );
    await ctx.reply(`Users (Page ${page})\n\n${lines.join('\n')}`);
  });

  bot.command('user', adminGuardMiddleware, async (ctx) => {
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!telegramId) {
      await ctx.reply('Usage: /user {telegram_id}');
      return;
    }
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('User not found.');
      return;
    }
    const [{ count: prepCount }, { count: letterCount }, { count: escalationOpenCount }] = await Promise.all([
      supabase.from('interview_preps').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('cover_letters').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('escalations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'open'),
    ]);
    await ctx.reply(
      `User ${user.full_name ?? 'Unknown'}\nStatus: ${user.status}\nDaily used: ${user.daily_generation_count}\nExtra credits: ${user.extra_credits}\nInterview preps: ${prepCount ?? 0}\nCover letters: ${letterCount ?? 0}\nOpen escalations: ${escalationOpenCount ?? 0}`,
    );
  });

  bot.command('approve', adminGuardMiddleware, async (ctx) => {
    const adminId = ctx.from?.id;
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!adminId || !telegramId) {
      await ctx.reply('Usage: /approve {telegram_id}');
      return;
    }
    await approvalService.setStatusByTelegramId(telegramId, 'approved', adminId);
    await auditService.logAction({
      adminTelegramId: adminId,
      actionType: 'approve_user',
      targetTelegramId: telegramId,
    });
    await ctx.reply('User approved.');
  });

  bot.command('reject', adminGuardMiddleware, async (ctx) => {
    const adminId = ctx.from?.id;
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!adminId || !telegramId) {
      await ctx.reply('Usage: /reject {telegram_id}');
      return;
    }
    await approvalService.setStatusByTelegramId(telegramId, 'rejected', adminId);
    await auditService.logAction({
      adminTelegramId: adminId,
      actionType: 'reject_user',
      targetTelegramId: telegramId,
    });
    await ctx.reply('User rejected.');
  });

  bot.command('ban', adminGuardMiddleware, async (ctx) => {
    const adminId = ctx.from?.id;
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!adminId || !telegramId) {
      await ctx.reply('Usage: /ban {telegram_id}');
      return;
    }
    await approvalService.setStatusByTelegramId(telegramId, 'banned', adminId);
    await auditService.logAction({
      adminTelegramId: adminId,
      actionType: 'ban_user',
      targetTelegramId: telegramId,
    });
    await ctx.reply('User banned.');
  });

  bot.command('unban', adminGuardMiddleware, async (ctx) => {
    const adminId = ctx.from?.id;
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!adminId || !telegramId) {
      await ctx.reply('Usage: /unban {telegram_id}');
      return;
    }
    await approvalService.setStatusByTelegramId(telegramId, 'pending_approval', adminId);
    await auditService.logAction({
      adminTelegramId: adminId,
      actionType: 'unban_user',
      targetTelegramId: telegramId,
    });
    await ctx.reply('User unbanned and moved to pending approval.');
  });

  bot.command('credits', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/) : [];
    const telegramId = parseId(args[1]);
    const amount = parseId(args[2]);
    if (!telegramId || amount === null) {
      await ctx.reply('Usage: /credits {telegram_id} {amount}');
      return;
    }
    await creditsService.adjustExtraCreditsByTelegramId(telegramId, amount);
    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'adjust_credits',
      targetTelegramId: telegramId,
      actionData: { amount },
    });
    await ctx.reply('Credits adjusted.');
  });

  bot.command('stats', adminGuardMiddleware, async (ctx) => {
    const users = await userService.listUsers(1, 100);
    const approved = users.filter((u) => u.status === 'approved').length;
    const pending = users.filter((u) => u.status === 'pending_approval').length;
    const [
      { count: leadsCount },
      { count: resumesCount },
      { count: docsCount },
      { count: paymentsCount },
      { count: prepCount },
      { count: lettersCount },
    ] =
      await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('resumes').select('id', { count: 'exact', head: true }),
        supabase.from('generated_documents').select('id', { count: 'exact', head: true }),
        supabase.from('payment_transactions').select('id', { count: 'exact', head: true }),
        supabase.from('interview_preps').select('id', { count: 'exact', head: true }),
        supabase.from('cover_letters').select('id', { count: 'exact', head: true }),
      ]);

    const { data: paidRows } = await supabase
      .from('payment_transactions')
      .select('amount_cents,status')
      .eq('status', 'succeeded');
    const grossRevenueCents = (paidRows ?? []).reduce((acc, row) => {
      const cents = typeof row.amount_cents === 'number' ? row.amount_cents : 0;
      return acc + cents;
    }, 0);

    const { data: escalationRows } = await supabase
      .from('escalations')
      .select('status')
      .in('status', ['open', 'resolved']);
    const openEscalations = (escalationRows ?? []).filter((r) => r.status === 'open').length;
    const resolvedEscalations = (escalationRows ?? []).filter((r) => r.status === 'resolved').length;

    const { data: appStatuses } = await supabase.from('application_tracker').select('status');
    const appliedCount = (appStatuses ?? []).filter((r) => r.status === 'applied').length;
    const screeningCount = (appStatuses ?? []).filter((r) => r.status === 'screening').length;
    const interviewCount = (appStatuses ?? []).filter((r) => r.status === 'interview').length;
    const offerCount = (appStatuses ?? []).filter((r) => r.status === 'offer').length;
    const rejectedCount = (appStatuses ?? []).filter((r) => r.status === 'rejected').length;
    const withdrawnCount = (appStatuses ?? []).filter((r) => r.status === 'withdrawn').length;
    const interviewRate = appliedCount > 0 ? (interviewCount / appliedCount) * 100 : 0;
    const offerRate = interviewCount > 0 ? (offerCount / interviewCount) * 100 : 0;
    const overallOfferRate = appliedCount > 0 ? (offerCount / appliedCount) * 100 : 0;

    await ctx.reply(
      `Users: ${users.length}\nApproved: ${approved}\nPending: ${pending}\nLeads: ${leadsCount ?? 0}\nResumes: ${resumesCount ?? 0}\nGenerated docs: ${docsCount ?? 0}\nInterview preps: ${prepCount ?? 0}\nCover letters: ${lettersCount ?? 0}\nPayments: ${paymentsCount ?? 0}\nGross revenue: $${(grossRevenueCents / 100).toFixed(2)}\nEscalations: ${openEscalations} open / ${resolvedEscalations} resolved\nApplication funnel: applied ${appliedCount} | screening ${screeningCount} | interview ${interviewCount} | offer ${offerCount} | rejected ${rejectedCount} | withdrawn ${withdrawnCount}\nConversion: interview rate ${interviewRate.toFixed(1)}% | offer-from-interview ${offerRate.toFixed(1)}% | offer-from-applied ${overallOfferRate.toFixed(1)}%`,
    );
  });
  bot.command('escalations', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/) : [];
    const limit = Math.max(1, Math.min(30, parseId(args[1]) ?? 10));
    const rows = await escalationService.listOpenCases(limit);
    if (rows.length === 0) {
      await ctx.reply('No open escalations.');
      return;
    }
    const lines = rows.map((row, idx) => `${idx + 1}. ${formatEscalationCaseLine(row)}`);
    await ctx.reply(`Open escalations (${rows.length})\n\n${lines.join('\n\n')}`);
  });

  bot.command('escalation', adminGuardMiddleware, async (ctx) => {
    const caseId = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '';
    if (!caseId) {
      await ctx.reply('Usage: /escalation {case_id}');
      return;
    }
    const row = await escalationService.getCaseById(caseId);
    if (!row) {
      await ctx.reply('Escalation case not found.');
      return;
    }
    const events = await escalationService.listCaseEvents(caseId, 10);
    const timeline = events
      .map(
        (event) =>
          `- ${event.created_at}: ${event.event_type}${event.actor_telegram_id ? ` by ${event.actor_telegram_id}` : ''}${event.note ? ` | ${event.note.slice(0, 120)}` : ''}`,
      )
      .join('\n');
    await ctx.reply(
      `Escalation ${row.id}\nStatus: ${row.status}\nUrgency: ${row.urgency}\nReason: ${row.reason}\nTrigger: ${row.trigger_type ?? '-'}${row.similarity_score ? ` (${row.similarity_score.toFixed(3)})` : ''}\nAssignee: ${row.assigned_admin_telegram_id ?? '-'}\nCreated: ${row.created_at}\nResolved: ${row.resolved_at ?? '-'}\nResolution note: ${row.resolution_note ?? '-'}\nSource: ${row.source_message.slice(0, 220)}\n\nTimeline:\n${timeline || '- none'}`,
    );
  });

  bot.command('escassign', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const caseId = args[1];
    const assigneeToken = args[2]?.toLowerCase();
    if (!caseId || !assigneeToken || !ctx.from?.id) {
      await ctx.reply('Usage: /escassign {case_id} {admin_telegram_id|me|clear}');
      return;
    }
    let targetAdminId: number | null = null;
    if (assigneeToken === 'me') {
      targetAdminId = ctx.from.id;
    } else if (assigneeToken === 'clear') {
      targetAdminId = null;
    } else {
      const parsed = parseId(assigneeToken);
      if (!parsed) {
        await ctx.reply('Assignee must be admin Telegram ID, "me", or "clear".');
        return;
      }
      targetAdminId = parsed;
    }
    const ok = await escalationService.assignCase(caseId, targetAdminId);
    if (!ok) {
      await ctx.reply('Open escalation case not found.');
      return;
    }
    await escalationService.addOperatorNote({
      caseId,
      adminTelegramId: ctx.from.id,
      note: targetAdminId ? `Assigned case to ${targetAdminId}` : 'Cleared assignee',
    });
    await auditService.logAction({
      adminTelegramId: ctx.from.id,
      actionType: 'escalation_assign',
      actionData: { caseId, assignedAdminTelegramId: targetAdminId },
    });
    await ctx.reply(targetAdminId ? `Escalation ${caseId} assigned to ${targetAdminId}.` : `Escalation ${caseId} unassigned.`);
  });

  bot.command('escnote', adminGuardMiddleware, async (ctx) => {
    if (!('message' in ctx) || !('text' in ctx.message) || !ctx.from?.id) return;
    const parts = ctx.message.text.split(/\s+/);
    const caseId = parts[1];
    const note = parts.slice(2).join(' ').trim();
    if (!caseId || !note) {
      await ctx.reply('Usage: /escnote {case_id} {note}');
      return;
    }
    const row = await escalationService.getCaseById(caseId);
    if (!row) {
      await ctx.reply('Escalation case not found.');
      return;
    }
    await escalationService.addOperatorNote({
      caseId,
      adminTelegramId: ctx.from.id,
      note,
    });
    await auditService.logAction({
      adminTelegramId: ctx.from.id,
      actionType: 'escalation_note',
      actionData: { caseId, note: note.slice(0, 200) },
    });
    await ctx.reply(`Note saved for escalation ${caseId}.`);
  });


  bot.command('queue', adminGuardMiddleware, async (ctx) => {
    if (!queues.fileProcessing) {
      await ctx.reply('Queue disabled (BullMQ Redis not configured).');
      return;
    }
    const waiting = await queues.fileProcessing.getWaitingCount();
    const active = await queues.fileProcessing.getActiveCount();
    const failed = await queues.fileProcessing.getFailedCount();
    await ctx.reply(`file_processing\nWaiting: ${waiting}\nActive: ${active}\nFailed: ${failed}`);
  });

  bot.command('costs', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const days = Math.max(1, Math.min(30, parseId(args[1]) ?? 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('ai_usage_events')
      .select('estimated_cost_usd,input_tokens,output_tokens,feature,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;
    const rows = data ?? [];
    const totalCost = rows.reduce((acc, r) => acc + (typeof r.estimated_cost_usd === 'number' ? r.estimated_cost_usd : Number(r.estimated_cost_usd) || 0), 0);
    const totalIn = rows.reduce((acc, r) => acc + (typeof r.input_tokens === 'number' ? r.input_tokens : 0), 0);
    const totalOut = rows.reduce((acc, r) => acc + (typeof r.output_tokens === 'number' ? r.output_tokens : 0), 0);
    const byFeature = new Map<string, { cost: number; count: number }>();
    for (const row of rows) {
      const key = typeof row.feature === 'string' && row.feature.length > 0 ? row.feature : 'unknown';
      const curr = byFeature.get(key) ?? { cost: 0, count: 0 };
      curr.cost += typeof row.estimated_cost_usd === 'number' ? row.estimated_cost_usd : Number(row.estimated_cost_usd) || 0;
      curr.count += 1;
      byFeature.set(key, curr);
    }
    const featureLines = [...byFeature.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 8)
      .map(([feature, stats]) => `- ${feature}: $${stats.cost.toFixed(4)} (${stats.count} calls)`);
    await ctx.reply(
      `AI cost report (last ${days} day(s))
Events: ${rows.length}
Estimated cost: $${totalCost.toFixed(4)}
Input tokens: ${totalIn}
Output tokens: ${totalOut}
Top features:
${featureLines.length > 0 ? featureLines.join('\n') : '- none'}`,
    );
  });

  bot.command('apps', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const maybeStatus = args[1]?.toLowerCase();
    const hasStatus = maybeStatus && APPLICATION_STATUSES.includes(maybeStatus as ApplicationStatus);
    const status = hasStatus ? (maybeStatus as ApplicationStatus) : undefined;
    const pageToken = hasStatus ? args[2] : args[1];
    const page = Math.max(1, parseId(pageToken) ?? 1);
    const from = (page - 1) * APPS_PAGE_SIZE;
    const to = from + APPS_PAGE_SIZE - 1;

    const countQuery = supabase.from('application_tracker').select('id', { count: 'exact', head: true });
    const rowsQuery = supabase
      .from('application_tracker')
      .select('id,user_id,company,role,status,next_action_date,updated_at')
      .order('updated_at', { ascending: false })
      .range(from, to);
    const counted = status ? countQuery.eq('status', status) : countQuery;
    const listed = status ? rowsQuery.eq('status', status) : rowsQuery;

    const [{ count, error: countError }, { data, error }] = await Promise.all([counted, listed]);
    if (countError) throw countError;
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) {
      await ctx.reply('No tracked applications found.');
      return;
    }
    const totalPages = Math.max(1, Math.ceil((count ?? 0) / APPS_PAGE_SIZE));
    await ctx.reply(
      `Applications board${status ? ` (${status})` : ''} - Page ${page}/${totalPages}\n\n${rows
        .map(
          (r, i) =>
            `${from + i + 1}. ${String(r.id)} | ${String(r.company)} | ${String(r.role)} | ${String(r.status)}${r.next_action_date ? ` | next: ${String(r.next_action_date)}` : ''}`,
        )
        .join('\n')}\n\nUsage: /apps [status] [page]`,
    );
  });

  bot.command('appdetail', adminGuardMiddleware, async (ctx) => {
    const appId = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '';
    if (!appId) {
      await ctx.reply('Usage: /appdetail {application_id}');
      return;
    }

    const { data, error } = await supabase
      .from('application_tracker')
      .select(
        'id,user_id,company,role,status,applied_date,next_action_date,follow_up_enabled,last_follow_up_sent_at,notes,created_at,updated_at',
      )
      .eq('id', appId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await ctx.reply('Application not found.');
      return;
    }

    const { data: user } = await supabase
      .from('users')
      .select('telegram_id,full_name')
      .eq('id', String(data.user_id))
      .maybeSingle();
    await ctx.reply(
      `Application detail\nID: ${String(data.id)}\nUser: ${user?.full_name ?? 'Unknown'} (${user?.telegram_id ?? 'n/a'})\nCompany: ${String(data.company)}\nRole: ${String(data.role)}\nStatus: ${String(data.status)}\nApplied: ${String(data.applied_date)}\nNext action: ${data.next_action_date ? String(data.next_action_date) : '-'}\nFollow-up enabled: ${Boolean(data.follow_up_enabled)}\nLast follow-up sent: ${data.last_follow_up_sent_at ? String(data.last_follow_up_sent_at) : '-'}\nNotes: ${data.notes ? String(data.notes).slice(0, 600) : '-'}\nUpdated: ${String(data.updated_at)}`,
    );
  });

  bot.command('appsetstatus', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const appId = args[1];
    const status = args[2]?.toLowerCase();
    if (!appId || !status || !APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
      await ctx.reply(`Usage: /appsetstatus {application_id} {${APPLICATION_STATUSES.join('|')}}`);
      return;
    }

    const { data, error } = await supabase
      .from('application_tracker')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', appId)
      .select('id,user_id,status')
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) {
      await ctx.reply('Application not found.');
      return;
    }

    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'admin_app_set_status',
      targetUserId: String(data.user_id),
      actionData: { applicationId: String(data.id), status },
    });
    await ctx.reply(`Application ${String(data.id)} status updated to "${status}".`);
  });

  bot.command('appsetnext', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const appId = args[1];
    const nextToken = args[2]?.toLowerCase();
    if (!appId || !nextToken) {
      await ctx.reply('Usage: /appsetnext {application_id} {YYYY-MM-DD|clear}');
      return;
    }
    if (nextToken !== 'clear' && !DATE_RE.test(nextToken)) {
      await ctx.reply('Date must be YYYY-MM-DD or "clear".');
      return;
    }
    const nextActionDate = nextToken === 'clear' ? null : nextToken;

    const { data, error } = await supabase
      .from('application_tracker')
      .update({ next_action_date: nextActionDate, updated_at: new Date().toISOString() })
      .eq('id', appId)
      .select('id,user_id,next_action_date')
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) {
      await ctx.reply('Application not found.');
      return;
    }

    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'admin_app_set_next_action',
      targetUserId: String(data.user_id),
      actionData: { applicationId: String(data.id), nextActionDate },
    });
    await ctx.reply(
      nextActionDate
        ? `Application ${String(data.id)} next action set to ${nextActionDate}.`
        : `Application ${String(data.id)} next action cleared.`,
    );
  });

  bot.command('appsbulkstatus', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const status = args[1]?.toLowerCase();
    const rawIds = args[2] ?? '';
    if (!status || !APPLICATION_STATUSES.includes(status as ApplicationStatus) || !rawIds) {
      await ctx.reply(`Usage: /appsbulkstatus {${APPLICATION_STATUSES.join('|')}} {id1,id2,...}`);
      return;
    }
    const ids = rawIds
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (ids.length === 0) {
      await ctx.reply('No application IDs provided.');
      return;
    }

    const { data: beforeRows, error: beforeError } = await supabase
      .from('application_tracker')
      .select('id,user_id')
      .in('id', ids);
    if (beforeError) throw beforeError;
    const matchedRows = beforeRows ?? [];
    if (matchedRows.length === 0) {
      await ctx.reply('No matching applications found.');
      return;
    }

    const { data: updatedRows, error } = await supabase
      .from('application_tracker')
      .update({ status, updated_at: new Date().toISOString() })
      .in(
        'id',
        matchedRows.map((r) => String(r.id)),
      )
      .select('id,user_id');
    if (error) throw error;

    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'admin_apps_bulk_set_status',
      actionData: {
        status,
        requestedIds: ids,
        updatedIds: (updatedRows ?? []).map((r) => String(r.id)),
      },
    });
    await ctx.reply(
      `Bulk status update complete: ${(updatedRows ?? []).length}/${ids.length} set to "${status}".`,
    );
  });

  bot.command('appsdue', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const days = Math.max(0, Math.min(30, parseId(args[1]) ?? 7));
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('application_tracker')
      .select('id,company,role,status,next_action_date,user_id')
      .not('next_action_date', 'is', null)
      .lte('next_action_date', target)
      .order('next_action_date', { ascending: true })
      .limit(50);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) {
      await ctx.reply(`No applications with next action due in the next ${days} day(s).`);
      return;
    }
    await ctx.reply(
      `Applications due in <= ${days} day(s):\n\n${rows
        .map(
          (r, i) =>
            `${i + 1}. ${String(r.id)} | ${String(r.company)} | ${String(r.role)} | ${String(r.status)} | due ${String(r.next_action_date)}`,
        )
        .join('\n')}`,
    );
  });

  bot.command('appsexport', adminGuardMiddleware, async (ctx) => {
    const args = 'message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/).filter(Boolean) : [];
    const maybeStatus = args[1]?.toLowerCase();
    const status = maybeStatus && APPLICATION_STATUSES.includes(maybeStatus as ApplicationStatus)
      ? (maybeStatus as ApplicationStatus)
      : null;
    if (maybeStatus && !status) {
      await ctx.reply(`Invalid status. Use one of: ${APPLICATION_STATUSES.join(', ')}`);
      return;
    }

    const query = supabase
      .from('application_tracker')
      .select(
        'id,user_id,company,role,status,applied_date,next_action_date,follow_up_enabled,last_follow_up_sent_at,notes,updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(5000);
    const scopedQuery = status ? query.eq('status', status) : query;
    const { data, error } = await scopedQuery;
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) {
      await ctx.reply('No applications found to export.');
      return;
    }

    const header = [
      'id',
      'user_id',
      'company',
      'role',
      'status',
      'applied_date',
      'next_action_date',
      'follow_up_enabled',
      'last_follow_up_sent_at',
      'notes',
      'updated_at',
    ].join(',');
    const body = rows
      .map((r) =>
        [
          escapeCsv(String(r.id)),
          escapeCsv(String(r.user_id)),
          escapeCsv(String(r.company)),
          escapeCsv(String(r.role)),
          escapeCsv(String(r.status)),
          escapeCsv(r.applied_date ? String(r.applied_date) : ''),
          escapeCsv(r.next_action_date ? String(r.next_action_date) : ''),
          escapeCsv(String(Boolean(r.follow_up_enabled))),
          escapeCsv(r.last_follow_up_sent_at ? String(r.last_follow_up_sent_at) : ''),
          escapeCsv(r.notes ? String(r.notes) : ''),
          escapeCsv(r.updated_at ? String(r.updated_at) : ''),
        ].join(','),
      )
      .join('\n');
    const csv = `${header}\n${body}\n`;
    const filename = `applications-export-${status ?? 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    await ctx.replyWithDocument({ source: Buffer.from(csv, 'utf8'), filename });
  });

  bot.command('latestprep', adminGuardMiddleware, async (ctx) => {
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!telegramId) {
      await ctx.reply('Usage: /latestprep {telegram_id}');
      return;
    }
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('User not found.');
      return;
    }
    const { data, error } = await supabase
      .from('interview_preps')
      .select('content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.content) {
      await ctx.reply('No interview prep found for user.');
      return;
    }
    const content = data.content as {
      focus_areas?: string[];
      technical_questions?: Array<{ question?: string }>;
      behavioral_questions?: Array<{ question?: string }>;
    };
    await ctx.reply(
      `Latest interview prep (${data.created_at ?? 'unknown'})\nFocus: ${(content.focus_areas ?? []).slice(0, 4).join(', ') || '-'}\nTech Q: ${content.technical_questions?.[0]?.question ?? '-'}\nBehavioral Q: ${content.behavioral_questions?.[0]?.question ?? '-'}`,
    );
  });

  bot.command('latestletter', adminGuardMiddleware, async (ctx) => {
    const telegramId = parseId('message' in ctx && 'text' in ctx.message ? ctx.message.text.split(/\s+/)[1] : '');
    if (!telegramId) {
      await ctx.reply('Usage: /latestletter {telegram_id}');
      return;
    }
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('User not found.');
      return;
    }
    const { data, error } = await supabase
      .from('cover_letters')
      .select('content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.content) {
      await ctx.reply('No cover letter found for user.');
      return;
    }
    const content = data.content as {
      subject?: string;
      greeting?: string;
      opening?: string;
    };
    await ctx.reply(
      `Latest cover letter (${data.created_at ?? 'unknown'})\nSubject: ${content.subject ?? '-'}\nGreeting: ${content.greeting ?? '-'}\nOpening: ${(content.opening ?? '-').slice(0, 200)}`,
    );
  });

  bot.command('reply', adminGuardMiddleware, async (ctx) => {
    if (!('message' in ctx) || !('text' in ctx.message)) return;
    const parts = ctx.message.text.split(/\s+/);
    const telegramId = parseId(parts[1]);
    const messageText = parts.slice(2).join(' ').trim();
    if (!telegramId || !messageText) {
      await ctx.reply('Usage: /reply {telegram_id} {message}');
      return;
    }
    await bot.telegram.sendMessage(telegramId, messageText);
    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'admin_reply',
      targetTelegramId: telegramId,
      actionData: { messageText },
    });
    await ctx.reply(`✅ Message sent to ${telegramId}`);
  });

  bot.command('resolve', adminGuardMiddleware, async (ctx) => {
    if (!('message' in ctx) || !('text' in ctx.message)) return;
    const parts = ctx.message.text.split(/\s+/);
    const target = parts[1];
    const resolutionNote = parts.slice(2).join(' ').trim();
    if (!target || !ctx.from?.id) {
      await ctx.reply('Usage: /resolve {case_id|telegram_id} [note]');
      return;
    }
    const resolvedCaseId = await escalationService.resolveCase(target, ctx.from.id, resolutionNote);
    if (!resolvedCaseId) {
      await ctx.reply('No matching open escalation found.');
      return;
    }
    const telegramId = parseId(target);
    if (telegramId) {
      await redis.set(`session:${telegramId}`, JSON.stringify(defaultSessionState()), {
        ex: 48 * 60 * 60,
      });
      await bot.telegram.sendMessage(telegramId, "Hope that helped! I'm back and ready to assist.");
    }
    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'resolve_escalation',
      targetTelegramId: telegramId ?? 0,
      actionData: { escalationCaseId: resolvedCaseId, resolutionNote: resolutionNote || null },
    });
    await ctx.reply(`Resolved escalation case ${resolvedCaseId}`);
  });

  bot.command('logs', adminGuardMiddleware, async (ctx) => {
    if (!('message' in ctx) || !('text' in ctx.message)) return;
    const parts = ctx.message.text.split(/\s+/);
    const telegramId = parseId(parts[1]);
    const limit = Math.max(1, Math.min(50, parseId(parts[2]) ?? 20));
    if (!telegramId) {
      await ctx.reply('Usage: /logs {telegram_id} [limit]');
      return;
    }
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('User not found.');
      return;
    }
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('role,content,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const lines = (data ?? []).map((m) => `[${m.role}] ${(m.content as string).slice(0, 160)}`);
    await ctx.reply(lines.length > 0 ? lines.join('\n') : 'No conversation logs found.');
  });

  bot.command('broadcast', adminGuardMiddleware, async (ctx) => {
    if (!('message' in ctx) || !('text' in ctx.message)) return;
    const messageText = ctx.message.text.replace(/^\/broadcast\s+/, '').trim();
    if (!messageText || messageText === ctx.message.text) {
      await ctx.reply('Usage: /broadcast {message}');
      return;
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id,telegram_id')
      .eq('status', 'approved');
    if (error) throw error;
    const targets = users ?? [];
    await ctx.reply(`Sending broadcast to ${targets.length} users...`);

    let sent = 0;
    let failed = 0;
    for (const user of targets) {
      await sleep(40);
      try {
        const tgId = user.telegram_id as number | null;
        if (!tgId) {
          failed += 1;
          continue;
        }
        await bot.telegram.sendMessage(tgId, messageText);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    await auditService.logAction({
      adminTelegramId: ctx.from?.id ?? 0,
      actionType: 'broadcast',
      actionData: { total: targets.length, sent, failed },
      notes: messageText.slice(0, 200),
    });
    await ctx.reply(`✅ Broadcast complete: ${sent} sent, ${failed} failed`);
  });

  bot.catch((err) => {
    logger.error({ err }, 'Admin handler error');
  });
}

