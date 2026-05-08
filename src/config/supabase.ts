import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

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

