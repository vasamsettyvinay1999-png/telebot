import { Markup } from 'telegraf';
import { ADMIN_TELEGRAM_IDS } from '../config/constants.js';
import { supabase } from '../config/supabase.js';
import { handleResumeUpload } from '../services/resume/upload.service.js';
import type { AppContext } from '../types/bot-context.js';
import type { AppUser } from '../types/session.js';
import { logger } from '../utils/logger.js';

const ONBOARDING_TIMEOUT_MS = 48 * 60 * 60 * 1000;

type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch(async () => fn());
}

function extractText(ctx: AppContext): string | null {
  if (ctx.message && 'text' in ctx.message) return ctx.message.text.trim();
  return null;
}

export function parseYearsOfExperience(input: string): number | null {
  const match = input.match(/\d{1,2}/);
  if (!match) return null;
  const years = Number.parseInt(match[0], 10);
  if (Number.isNaN(years) || years < 0 || years > 50) return null;
  return years;
}

export function parseTargetRoles(input: string): string[] {
  return input
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

async function updateUser(
  userId: string,
  values: Record<string, unknown>,
  retryMessage: string,
): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabase.from('users').update(values).eq('id', userId);
    if (error) throw error;
  }).catch((error: unknown) => {
    logger.error({ err: error, userId, values }, 'Onboarding DB update failed');
    throw new Error(retryMessage);
  });
}

async function sendWelcome(ctx: AppContext): Promise<void> {
  await ctx.reply(
    "Hey! I'm Orion — your AI career partner. I'm here to help you land your next role faster and smarter. Let's get you set up. What's your name? 👋",
  );
}

function resetOnboardingState(ctx: AppContext): void {
  ctx.session.currentFlow = 'onboarding';
  ctx.session.flowStep = 1;
  ctx.session.tempData = {};
}

async function notifyAdminsForApproval(ctx: AppContext, user: AppUser): Promise<void> {
  const role =
    typeof ctx.session.tempData.target_roles_preview === 'string'
      ? ctx.session.tempData.target_roles_preview
      : 'N/A';
  const yoe =
    typeof ctx.session.tempData.yoe_preview === 'string' ? ctx.session.tempData.yoe_preview : 'N/A';
  const auth =
    typeof ctx.session.tempData.work_auth_preview === 'string'
      ? ctx.session.tempData.work_auth_preview
      : 'N/A';
  const name =
    typeof ctx.session.tempData.full_name === 'string' ? ctx.session.tempData.full_name : 'Unknown';

  const text = `🆕 New candidate pending approval: ${name} | Target: ${role} | YoE: ${yoe} | Auth: ${auth}`;
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('✅ Approve', `admin:approve:${user.id}`),
    Markup.button.callback('❌ Reject', `admin:reject:${user.id}`),
  ]);

  await Promise.all(
    ADMIN_TELEGRAM_IDS.map(async (adminId) => {
      try {
        await ctx.telegram.sendMessage(Number(adminId), text, keyboard);
      } catch (error) {
        logger.error({ err: error, adminId: adminId.toString() }, 'Admin notification failed');
      }
    }),
  );
}

async function handleStepName(ctx: AppContext, user: AppUser): Promise<void> {
  const text = extractText(ctx);
  if (!text || text.length < 2 || text.length > 80) {
    await ctx.reply('Please send a valid name between 2 and 80 characters.');
    return;
  }

  await updateUser(user.id, { full_name: text, updated_at: new Date().toISOString() }, 'Could not save your name. Please try again.');
  ctx.session.tempData.full_name = text;
  ctx.session.flowStep = 2;
  await ctx.reply(
    "Nice to meet you, " +
      `${text}! What role are you targeting right now? (e.g., 'Senior Data Engineer', 'Full Stack Developer', 'QA Manager')`,
  );
}

async function handleStepRole(ctx: AppContext, user: AppUser): Promise<void> {
  const text = extractText(ctx);
  if (!text) {
    await ctx.reply('Please share at least one target role.');
    return;
  }
  const roles = parseTargetRoles(text);
  if (roles.length === 0) {
    await ctx.reply('I could not parse any roles. Try comma-separated roles.');
    return;
  }

  await updateUser(user.id, { target_roles: roles, updated_at: new Date().toISOString() }, 'Could not save your target role. Please try again.');
  ctx.session.tempData.target_roles_preview = roles.join(', ');
  ctx.session.flowStep = 3;
  await ctx.reply('Got it. How many years of relevant experience do you have?');
}

async function handleStepYoE(ctx: AppContext, user: AppUser): Promise<void> {
  const text = extractText(ctx);
  if (!text) {
    await ctx.reply("Please reply with your years of experience (example: '5 years').");
    return;
  }
  const years = parseYearsOfExperience(text);
  if (years === null) {
    await ctx.reply("I couldn't read that. Please send a number between 0 and 50.");
    return;
  }

  await updateUser(user.id, { years_of_experience: years, updated_at: new Date().toISOString() }, 'Could not save your experience. Please try again.');
  ctx.session.tempData.yoe_preview = String(years);
  ctx.session.flowStep = 4;
  await ctx.reply(
    "And what's your current work authorization in the US?",
    Markup.inlineKeyboard([
      [Markup.button.callback('US Citizen', 'onboard:auth:US Citizen')],
      [Markup.button.callback('Green Card', 'onboard:auth:Green Card')],
      [Markup.button.callback('H1B', 'onboard:auth:H1B')],
      [Markup.button.callback('OPT/CPT', 'onboard:auth:OPT/CPT')],
      [Markup.button.callback('TN Visa', 'onboard:auth:TN Visa')],
      [Markup.button.callback('Other', 'onboard:auth:Other')],
    ]),
  );
}

async function handleStepLocation(ctx: AppContext, user: AppUser): Promise<void> {
  const text = extractText(ctx);
  if (!text) {
    await ctx.reply("Please share your location, or type 'Remote only'.");
    return;
  }
  await updateUser(user.id, { location: text, updated_at: new Date().toISOString() }, 'Could not save your location. Please try again.');
  ctx.session.flowStep = 6;
  await ctx.reply(
    "Perfect. Now upload your current resume (PDF or DOCX) and I'll take a look. 📎 If you don't have one ready, type 'skip' and we can start fresh.",
  );
}

async function finishOnboarding(ctx: AppContext, user: AppUser): Promise<void> {
  await updateUser(
    user.id,
    {
      status: 'pending_approval',
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    },
    'I could not finalize onboarding. Please try again.',
  );
  ctx.state.user = { ...user, status: 'pending_approval' };
  ctx.session.currentFlow = null;
  ctx.session.flowStep = 7;
  await ctx.reply(
    "You're all set! 🎯 Your profile has been sent to the Orion Path team for a quick review. You'll hear from us within 24 hours. In the meantime, feel free to ask me anything about job searching, ATS systems, or your resume — I'm already learning your background.",
  );
  await notifyAdminsForApproval(ctx, user);
}

async function handleStepResume(ctx: AppContext, user: AppUser): Promise<void> {
  const text = extractText(ctx);
  if (text?.toLowerCase() === 'skip') {
    await finishOnboarding(ctx, user);
    return;
  }

  if (ctx.message && 'document' in ctx.message) {
    try {
      await ctx.reply('Reading your resume...');
      const uploaded = await handleResumeUpload(
        user.id,
        user.telegram_id,
        ctx.message.document.file_id,
        ctx.message.document.file_size,
      );
      await ctx.reply(
        `Resume uploaded (${uploaded.fileType.toUpperCase()}). Processing has started in the background.`,
      );
      await finishOnboarding(ctx, user);
    } catch (error) {
      logger.error({ err: error, userId: user.id }, 'Resume upload flow failed');
      await ctx.reply('I could not process that file. Please upload a valid PDF/DOCX/TXT under 20MB.');
    }
    return;
  }

  await ctx.reply('Please upload a PDF/DOCX resume, or type "skip".');
}

export async function maybeStartOnboarding(ctx: AppContext): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) return false;
  if (user.status !== 'onboarding') return false;
  if (ctx.session.currentFlow === 'onboarding') return false;

  resetOnboardingState(ctx);
  const text = extractText(ctx);
  // Only force the welcome prompt on explicit /start (or non-text events).
  // For normal text, let handleOnboardingFlow consume it as step 1 input.
  if (!text || text.startsWith('/start')) {
    await sendWelcome(ctx);
    return true;
  }
  return false;
}

export async function handleOnboardingFlow(ctx: AppContext): Promise<boolean> {
  const user = ctx.state.user;
  if (!user || user.status !== 'onboarding' || ctx.session.currentFlow !== 'onboarding') return false;

  if (Date.now() - ctx.session.lastActivity > ONBOARDING_TIMEOUT_MS) {
    resetOnboardingState(ctx);
    await ctx.reply("Let's restart quickly so nothing gets lost.");
    await sendWelcome(ctx);
    return true;
  }

  const step = ctx.session.flowStep as OnboardingStep;
  if (step === 1) {
    await handleStepName(ctx, user);
    return true;
  }
  if (step === 2) {
    await handleStepRole(ctx, user);
    return true;
  }
  if (step === 3) {
    if (ctx.message && 'document' in ctx.message) {
      await ctx.reply("We'll grab your resume in the next step. First, tell me your years of experience.");
      return true;
    }
    await handleStepYoE(ctx, user);
    return true;
  }
  if (step === 4) {
    await ctx.reply('Choose your work authorization using the buttons above.');
    return true;
  }
  if (step === 5) {
    await handleStepLocation(ctx, user);
    return true;
  }
  if (step === 6) {
    await handleStepResume(ctx, user);
    return true;
  }
  return false;
}

export async function handleOnboardingCallback(ctx: AppContext): Promise<boolean> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return false;
  const user = ctx.state.user;
  if (!user) return false;

  const data = ctx.callbackQuery.data;
  if (!data.startsWith('onboard:auth:')) return false;
  if (ctx.session.currentFlow !== 'onboarding' || ctx.session.flowStep !== 4) {
    await ctx.answerCbQuery('This step is no longer active.');
    return true;
  }

  const value = data.replace('onboard:auth:', '');
  await updateUser(
    user.id,
    { work_authorization: value, updated_at: new Date().toISOString() },
    'Could not save work authorization. Please try again.',
  );
  ctx.session.tempData.work_auth_preview = value;
  ctx.session.flowStep = 5;
  await ctx.answerCbQuery('Saved');
  await ctx.reply(
    "Last one — what city/region are you based in? (or type 'Remote only' if that's your preference)",
  );
  return true;
}

export async function handleAdminApprovalCallback(ctx: AppContext): Promise<boolean> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return false;
  const sender = ctx.from?.id;
  if (!sender) return false;
  const data = ctx.callbackQuery.data;
  if (!data.startsWith('admin:approve:') && !data.startsWith('admin:reject:')) return false;

  const isAdmin = ADMIN_TELEGRAM_IDS.includes(BigInt(sender));
  if (!isAdmin) {
    await ctx.answerCbQuery('Unauthorized');
    await ctx.reply('⛔ Unauthorized');
    return true;
  }

  const [, action, userId] = data.split(':');
  const status = action === 'approve' ? 'approved' : 'rejected';

  await withRetry(async () => {
    const { error } = await supabase
      .from('users')
      .update({
        status,
        approved_by: sender,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) throw error;
  }).catch(async (error: unknown) => {
    logger.error({ err: error, userId, status }, 'Admin approval callback failed');
    await ctx.answerCbQuery('Action failed');
  });

  await ctx.answerCbQuery(action === 'approve' ? 'Approved' : 'Rejected');
  const text =
    status === 'approved'
      ? "Great news! You've been approved. 🎉 You have 5 premium generations available today.\nHere's what you can do:\n• /analyze — ATS analysis of your resume\n• /optimize — Optimize your resume for a specific job\n• /interview — Generate interview prep package\n• /help — See all commands"
      : 'Your application was reviewed and is not approved at this time.';

  try {
    const { data: targetUser } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('id', userId)
      .single();
    if (typeof targetUser?.telegram_id === 'number') {
      await ctx.telegram.sendMessage(targetUser.telegram_id, text);
    }
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to notify user after admin callback');
  }

  if (ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
    await ctx.editMessageText(`Action completed: ${status.toUpperCase()} for user ${userId}`);
  }
  return true;
}

