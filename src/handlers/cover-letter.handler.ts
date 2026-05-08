import type { AppContext } from '../types/bot-context.js';
import { supabase } from '../config/supabase.js';
import { StripeService } from '../services/payments/stripe.service.js';
import { CoverLetterService } from '../services/career/cover-letter.service.js';

const stripeService = new StripeService();
const coverLetterService = new CoverLetterService();

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

export async function maybeHandleCoverLetterFlow(ctx: AppContext): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) return false;
  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text.trim();

  if (ctx.session.pendingConfirmation === 'awaiting_jd_for_cover_letter') {
    const resumeText = await getActiveResumeText(user.id);
    if (!resumeText) {
      ctx.session.pendingConfirmation = null;
      await ctx.reply('No active resume found. Upload a resume first.');
      return true;
    }
    const jd = text.toLowerCase() === 'skip' ? undefined : text;
    const coverLetter = await coverLetterService.generate(user.id, resumeText, jd);
    await coverLetterService.save(user.id, coverLetter);
    const letterText = [
      coverLetter.greeting,
      '',
      coverLetter.opening,
      ...coverLetter.body_paragraphs,
      '',
      coverLetter.closing,
      '',
      coverLetter.signature,
    ].join('\n');
    await ctx.reply(`✉️ Cover Letter Ready\nSubject: ${coverLetter.subject}\n\n${letterText}`);
    ctx.session.pendingConfirmation = null;
    return true;
  }

  if (!text.startsWith('/coverletter')) return false;
  const allowed = await stripeService.deductCredit(user.id, 'cover_letter');
  if (!allowed) {
    await ctx.reply('No credits available right now. Use /buy or wait for daily reset.');
    return true;
  }
  await ctx.reply("Paste a job description for tailoring, or type 'skip' to generate a general cover letter.");
  ctx.session.pendingConfirmation = 'awaiting_jd_for_cover_letter';
  return true;
}

