import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mqtyjzdwwgeycvmbiqsg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdHlqemR3d2dleWN2bWJpcXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDkwODYsImV4cCI6MjA5NTM4NTA4Nn0.rNPwuckpVrQ26J_CFaH6pUPnD2iIUjyxjJZjE6zL6t0';

// Synchronous Bootstrap Check: clear expired/invalid sessions from localStorage 
// BEFORE GoTrue initializes to completely bypass Deno/GoTrue infinite promise hangs
const storageKey = 'sb-mqtyjzdwwgeycvmbiqsg-auth-token';
try {
  const sessionStr = localStorage.getItem(storageKey);
  if (sessionStr) {
    const session = JSON.parse(sessionStr);
    const exp = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    
    console.log(`[Bootstrap] Found cached session. Expires in: ${exp ? exp - now : 'N/A'}s`);
    
    if (!exp || exp - now < 60) {
      console.warn('[Bootstrap] Session is expired or expiring soon. Clearing to prevent infinite token refresh lock!');
      localStorage.removeItem(storageKey);
    }
  }
} catch (e) {
  console.error('[Bootstrap] Error checking cached session:', e);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
});

export { SUPABASE_URL };
