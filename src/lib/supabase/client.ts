import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Use the standard @supabase/supabase-js client (NOT @supabase/ssr's createBrowserClient).
// createBrowserClient from @supabase/ssr calls getSession() on every request/navigation
// to support SSR hydration — this causes a continuous token refresh loop in the browser.
// The standard client only refreshes tokens when they actually expire (~55 min intervals).
let _client: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  if (_client) return _client;

  _client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sb-auth-token',
      },
    }
  );

  return _client;
}
