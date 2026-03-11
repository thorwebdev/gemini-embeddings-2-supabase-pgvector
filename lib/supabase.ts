import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client for server-side operations that bypass RLS
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey && supabaseUrl !== 'https://placeholder.supabase.co')
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;
