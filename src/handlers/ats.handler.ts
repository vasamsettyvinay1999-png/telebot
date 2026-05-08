import type { AppContext } from '../types/bot-context.js';
import { StripeService } from '../services/payments/stripe.service.js';
import { ATSAnalyzer } from '../services/resume/ats.analyzer.js';
import { supabase } from '../config/supabase.js';

const stripeService = new StripeService();
const atsAnalyzer = new ATSAnalyzer();

async function getActiveResume(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('raw_text')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return (data?.raw_text as string | null) ?? null;
}

export async function maybeHandleATSFlow(ctx: AppContext): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) return false;

  if (ctx.session.pendingConfirmation === 'awaiting_jd_for_ats') {
    if (!ctx.message || !('text' in ctx.message)) return true;
    const text = ctx.message.text.trim();
    const resumeText = await getActiveResume(user.id);
    if (!resumeText) {
      await ctx.reply('No active resume found. Upload a resume first.');
      ctx.session.pendingConfirmation = null;
      return true;
    }
    const report = await atsAnalyzer.analyzeResumeWithClaude(
      resumeText,
      text.toLowerCase() === 'skip' ? undefined : text,
    );
    await ctx.reply(
      `📊 ATS Analysis Complete\n\n🎯 ATS Score: ${report.ats_score}/100${
        report.fit_score !== null ? `\n🔗 Job Fit: ${report.fit_score}/100` : ''
      }\n\n${report.verdict}`,
    );
    if (report.keywords.missing_critical.length > 0) {
      await ctx.reply(
        `🔍 Missing Keywords (${report.keywords.missing_critical.length}):\n${report.keywords.missing_critical
          .slice(0, 10)
          .join(', ')}`,
      );
    }
    await ctx.reply('Reply /optimize to tailor your resume for this role.');
    ctx.session.pendingConfirmation = null;
    return true;
  }

  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text.trim();
  if (!text.startsWith('/analyze') && !/ats/i.test(text)) return false;

  const allowed = await stripeService.deductCredit(user.id, 'ats_analysis');
  if (!allowed) {
    await ctx.reply(
      'You have no credits available right now. Use /buy or wait for daily reset at midnight UTC.',
    );
    return true;
  }

  const resumeText = await getActiveResume(user.id);
  if (!resumeText) {
    await ctx.reply('No active resume found. Upload a resume first.');
    return true;
  }

  await ctx.reply(
    "Would you like to paste a job description for deeper analysis?\nReply with JD text or type 'skip'.",
  );
  ctx.session.pendingConfirmation = 'awaiting_jd_for_ats';
  return true;
}

