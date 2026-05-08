import type { AppContext } from '../types/bot-context.js';
import { supabase } from '../config/supabase.js';
import { StripeService } from '../services/payments/stripe.service.js';
import { InterviewPrepService } from '../services/career/interview-prep.service.js';

const stripeService = new StripeService();
const interviewPrepService = new InterviewPrepService();

async function getActiveResumeText(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('raw_text')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return (data?.raw_text as string | null) ?? null;
}

export async function maybeHandleInterviewPrepFlow(ctx: AppContext): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) return false;
  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text.trim();

  if (ctx.session.pendingConfirmation === 'awaiting_jd_for_interview') {
    const resumeText = await getActiveResumeText(user.id);
    if (!resumeText) {
      ctx.session.pendingConfirmation = null;
      await ctx.reply('No active resume found. Upload a resume first.');
      return true;
    }
    const jd = text.toLowerCase() === 'skip' ? undefined : text;
    const prep = await interviewPrepService.generate(user.id, resumeText, jd);
    await interviewPrepService.save(user.id, prep);
    await ctx.reply(
      `🎯 Interview Prep Ready\n\nFocus areas:\n- ${prep.focus_areas.slice(0, 5).join('\n- ')}\n\nTop technical Q:\n${prep.technical_questions[0]?.question ?? 'N/A'}\n\nTop behavioral Q:\n${prep.behavioral_questions[0]?.question ?? 'N/A'}`,
    );
    ctx.session.pendingConfirmation = null;
    return true;
  }

  if (!text.startsWith('/interview')) return false;
  const allowed = await stripeService.deductCredit(user.id, 'interview_prep');
  if (!allowed) {
    await ctx.reply('No credits available right now. Use /buy or wait for daily reset.');
    return true;
  }
  await ctx.reply(
    "Paste a job description for tailored interview prep, or type 'skip' for generic prep from your resume.",
  );
  ctx.session.pendingConfirmation = 'awaiting_jd_for_interview';
  return true;
}

