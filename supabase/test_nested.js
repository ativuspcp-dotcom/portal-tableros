import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mqtyjzdwwgeycvmbiqsg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdHlqemR3d2dleWN2bWJpcXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDkwODYsImV4cCI6MjA5NTM4NTA4Nn0.rNPwuckpVrQ26J_CFaH6pUPnD2iIUjyxjJZjE6zL6t0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testando query de getAllUsers com modules:module_id...');
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      *,
      user_module_permissions!user_id (
        *,
        modules:module_id (id, name, slug, icon)
      )
    `);

  if (error) {
    console.error('Erro:', error.message);
  } else {
    console.log('Sucesso! Total de usuários:', data.length);
  }
}

test();
