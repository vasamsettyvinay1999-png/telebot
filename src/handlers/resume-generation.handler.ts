import type { AppContext } from '../types/bot-context.js';
import { ResumeGeneratorService } from '../services/resume/generator.service.js';
import { StripeService } from '../services/payments/stripe.service.js';
import { supabase } from '../config/supabase.js';

const generatorService = new ResumeGeneratorService();
const stripeService = new StripeService();

async function getActiveResumeId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | null) ?? null;
}

export async function maybeHandleOptimizeFlow(ctx: AppContext): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text.trim().toLowerCase();
  if (!text.startsWith('/optimize')) return false;

  const user = ctx.state.user;
  if (!user) return true;

  const creditOk = await stripeService.deductCredit(user.id, 'resume_optimization');
  if (!creditOk) {
    await ctx.reply(
      'No credits available for optimization right now. Use /buy or wait for daily reset.',
    );
    return true;
  }

  const resumeId = await getActiveResumeId(user.id);
  if (!resumeId) {
    await ctx.reply('No active resume found. Upload a resume first.');
    return true;
  }

  await ctx.reply('Optimizing your resume now. This can take a minute...');
  const generated = await generatorService.generateOptimizedResume(user.id, resumeId);
  const docxSigned = await supabase.storage
    .from('resumes')
    .createSignedUrl(generated.docxPath, 60 * 60 * 24);
  const pdfSigned = await supabase.storage
    .from('resumes')
    .createSignedUrl(generated.pdfPath, 60 * 60 * 24);

  await ctx.reply(
    `✅ Your optimized resume is ready!\n\n📄 DOCX: ${docxSigned.data?.signedUrl ?? 'Unavailable'}\n📋 PDF: ${pdfSigned.data?.signedUrl ?? 'Unavailable'}`,
  );

  await supabase.from('generated_documents').insert({
    user_id: user.id,
    source_resume_id: resumeId,
    doc_type: 'tailored_resume',
    docx_storage_path: generated.docxPath,
    pdf_storage_path: generated.pdfPath,
    credit_deducted: true,
  });

  return true;
}

