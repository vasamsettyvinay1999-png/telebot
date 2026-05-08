export interface SessionState {
  currentFlow: string | null;
  flowStep: number;
  awaitingFileType: string | null;
  pendingConfirmation: string | null;
  lastActivity: number;
  tempData: Record<string, unknown>;
}

export const defaultSessionState = (): SessionState => ({
  currentFlow: null,
  flowStep: 0,
  awaitingFileType: null,
  pendingConfirmation: null,
  lastActivity: Date.now(),
  tempData: {},
});

export interface AppUser {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  status: 'onboarding' | 'pending_approval' | 'approved' | 'rejected' | 'banned';
}

