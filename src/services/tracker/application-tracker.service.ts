import { supabase } from '../../config/supabase.js';

export const APPLICATION_STATUSES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  status: string;
  applied_date: string;
  follow_up_enabled: boolean;
  next_action_date?: string | null;
  notes?: string | null;
}

export class ApplicationTrackerService {
  public async addApplication(input: {
    userId: string;
    company: string;
    role: string;
    status?: string;
    appliedDate?: string;
  }): Promise<void> {
    const { error } = await supabase.from('application_tracker').insert({
      user_id: input.userId,
      company: input.company,
      role: input.role,
      status: input.status ?? 'applied',
      applied_date: input.appliedDate ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
  }

  public async listApplications(
    userId: string,
    limit = 20,
    page = 1,
    status?: ApplicationStatus,
  ): Promise<{
    rows: Array<{
      id: string;
      company: string;
      role: string;
      status: string;
      next_action_date: string | null;
      notes: string | null;
    }>;
    total: number;
  }> {
    const from = Math.max(0, (page - 1) * limit);
    const to = from + limit - 1;

    const countQuery = supabase
      .from('application_tracker')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    const rowsQuery = supabase
      .from('application_tracker')
      .select('id,company,role,status,next_action_date,notes,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    const counted = status ? countQuery.eq('status', status) : countQuery;
    const listed = status ? rowsQuery.eq('status', status) : rowsQuery;

    const [{ count, error: countError }, { data, error }] = await Promise.all([counted, listed]);
    if (countError) throw countError;
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  }

  public async setFollowUp(userId: string, applicationId: string, enabled: boolean): Promise<boolean> {
    const { data, error } = await supabase
      .from('application_tracker')
      .update({ follow_up_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', applicationId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  public async setStatus(
    userId: string,
    applicationId: string,
    status: ApplicationStatus,
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('application_tracker')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', applicationId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  public async setNotes(userId: string, applicationId: string, notes: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('application_tracker')
      .update({ notes: notes.slice(0, 800), updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', applicationId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  public async setNextActionDate(
    userId: string,
    applicationId: string,
    nextActionDate: string | null,
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from('application_tracker')
      .update({ next_action_date: nextActionDate, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', applicationId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  public async listDueFollowUps(limit = 50): Promise<
    Array<{
      applicationId: string;
      userId: string;
      company: string;
      role: string;
      appliedDate: string;
      nextActionDate: string | null;
      notes: string | null;
    }>
  > {
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('application_tracker')
      .select(
        'id,user_id,company,role,applied_date,status,follow_up_enabled,last_follow_up_sent_at,next_action_date,notes',
      )
      .eq('follow_up_enabled', true)
      .eq('status', 'applied')
      .order('applied_date', { ascending: true })
      .limit(limit);
    if (error) throw error;

    const nowMs = Date.now();
    return (data ?? [])
      .filter((row) => {
        const nextActionDate = row.next_action_date ? String(row.next_action_date) : null;
        if (nextActionDate) {
          // If a next action date exists, only remind when that date has arrived.
          if (nextActionDate > new Date().toISOString().slice(0, 10)) return false;
        } else {
          // Fallback: one week after applied date.
          const appliedDate = String(row.applied_date);
          if (appliedDate > threshold) return false;
        }
        if (!row.last_follow_up_sent_at) return true;
        const last = Date.parse(String(row.last_follow_up_sent_at));
        if (Number.isNaN(last)) return true;
        return nowMs - last >= 7 * 24 * 60 * 60 * 1000;
      })
      .map((row) => ({
        applicationId: String(row.id),
        userId: String(row.user_id),
        company: String(row.company),
        role: String(row.role),
        appliedDate: String(row.applied_date),
        nextActionDate: row.next_action_date ? String(row.next_action_date) : null,
        notes: row.notes ? String(row.notes) : null,
      }));
  }

  public async markFollowUpSent(applicationId: string): Promise<void> {
    const { error } = await supabase
      .from('application_tracker')
      .update({ last_follow_up_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', applicationId);
    if (error) throw error;
  }
}

