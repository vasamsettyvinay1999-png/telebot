import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from './env.js';

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = ws;
}

/**
 * Supabase client using the service role key.
 * Never use the anon key from a server process.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

