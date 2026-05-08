import type { AppContext } from '../types/bot-context.js';
import { supabase } from '../config/supabase.js';

async function getLatestGeneratedResumeLinks(
  userId: string,
): Promise<{ docx: string | null; pdf: string | null; createdAt: string | null }> {
  const { data, error } = await supabase
    .from('generated_documents')
    .select('docx_storage_path,pdf_storage_path,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { docx: null, pdf: null, createdAt: null };

  const docxPath =
    typeof data.docx_storage_path === 'string' && data.docx_storage_path.length > 0
      ? data.docx_storage_path
      : null;
  const pdfPath =
    typeof data.pdf_storage_path === 'string' && data.pdf_storage_path.length > 0
      ? data.pdf_storage_path
      : null;

  let docxUrl: string | null = null;
  let pdfUrl: string | null = null;
  if (docxPath) {
    const signed = await supabase.storage.from('resumes').createSignedUrl(docxPath, 60 * 60 * 24);
    docxUrl = signed.data?.signedUrl ?? null;
  }
  if (pdfPath) {
    const signed = await supabase.storage.from('resumes').createSignedUrl(pdfPath, 60 * 60 * 24);
    pdfUrl = signed.data?.signedUrl ?? null;
  }

  return {
    docx: docxUrl,
    pdf: pdfUrl,
    createdAt: typeof data.created_at === 'string' ? data.created_at : null,
  };
}

async function getLatestInterviewPrepSummary(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('interview_preps')
    .select('content,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.content) return null;
  const content = data.content as {
    focus_areas?: string[];
    technical_questions?: Array<{ question?: string }>;
    behavioral_questions?: Array<{ question?: string }>;
  };
  return `Interview prep (${data.created_at ?? 'unknown'}):\n- Focus: ${(content.focus_areas ?? []).slice(0, 4).join(', ') || '-'}\n- Tech Q: ${content.technical_questions?.[0]?.question ?? '-'}\n- Behavioral Q: ${content.behavioral_questions?.[0]?.question ?? '-'}`;
}

async function getLatestCoverLetterSummary(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('cover_letters')
    .select('content,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.content) return null;
  const content = data.content as {
    subject?: string;
    greeting?: string;
    opening?: string;
  };
  const opening = (content.opening ?? '-').slice(0, 220);
  return `Cover letter (${data.created_at ?? 'unknown'}):\n- Subject: ${content.subject ?? '-'}\n- Greeting: ${content.greeting ?? '-'}\n- Opening: ${opening}`;
}

export async function maybeHandleHistoryCommands(ctx: AppContext): Promise<boolean> {
  const user = ctx.state.user;
  if (!user) return false;
  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text.trim().toLowerCase();

  if (text === '/mydocs') {
    const latest = await getLatestGeneratedResumeLinks(user.id);
    if (!latest.docx && !latest.pdf) {
      await ctx.reply('No generated resume documents found yet. Use /optimize first.');
      return true;
    }
    await ctx.reply(
      `📁 Latest generated resume (${latest.createdAt ?? 'unknown'})\n📄 DOCX: ${latest.docx ?? 'Unavailable'}\n📋 PDF: ${latest.pdf ?? 'Unavailable'}`,
    );
    return true;
  }

  if (text === '/history') {
    const [resumeLinks, prepSummary, letterSummary] = await Promise.all([
      getLatestGeneratedResumeLinks(user.id),
      getLatestInterviewPrepSummary(user.id),
      getLatestCoverLetterSummary(user.id),
    ]);

    const lines: string[] = ['📚 Your latest artifacts'];
    if (resumeLinks.docx || resumeLinks.pdf) {
      lines.push(
        `\nResume (${resumeLinks.createdAt ?? 'unknown'}):\n- DOCX: ${resumeLinks.docx ?? 'Unavailable'}\n- PDF: ${resumeLinks.pdf ?? 'Unavailable'}`,
      );
    } else {
      lines.push('\nResume: none yet');
    }
    lines.push(`\n${prepSummary ?? 'Interview prep: none yet'}`);
    lines.push(`\n${letterSummary ?? 'Cover letter: none yet'}`);
    await ctx.reply(lines.join('\n'));
    return true;
  }

  return false;
}

