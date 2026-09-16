import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gmburfjogtqoqqruxxfq.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYnVyZmpvZ3Rxb3FxcnV4eGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjY2MDYsImV4cCI6MjA5ODEwMjYwNn0.Jo55j_SU38TQXLRgmjze8GfxcXFgIsco_q3tgd8WKco';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
