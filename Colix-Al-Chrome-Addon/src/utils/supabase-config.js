// utils/supabase-config.js
// Supabase Configuration - Hardcoded for Production
// 
// SECURITY NOTE:
// ✅ Anon Key is safe to expose (public client-side key)
// ✅ Protected by RLS policies on all database tables
// ✅ Each user can only access their own data via email column
// ✅ Service Role Key (secret) is NOT exposed

/**
 * Hardcoded Supabase Configuration
 * Safe for public/client-side use because:
 * - Only Anon Key is used (not Service Role Key)
 * - RLS policies protect data isolation
 * - Database enforces: WHERE email = auth.jwt() ->> 'email'
 */
const SUPABASE_CONFIG = {
  URL: 'https://nfscsyngtjfknaygyrni.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mc2NzeW5ndGpma25heWd5cm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDExNzAsImV4cCI6MjEwMjIxNzE3MH0.l1BD1jB62lkG_rNEVQMH9yI8BFznhHrbOZYG4YSZWPI'
};

/**
 * Get Supabase config
 * @returns {Promise<Object>} - Configuration object {URL, ANON_KEY}
 */
async function getSupabaseConfig() {
  return Promise.resolve(SUPABASE_CONFIG);
}
