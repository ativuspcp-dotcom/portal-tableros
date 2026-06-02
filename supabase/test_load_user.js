import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mqtyjzdwwgeycvmbiqsg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdHlqemR3d2dleWN2bWJpcXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDkwODYsImV4cCI6MjA5NTM4NTA4Nn0.rNPwuckpVrQ26J_CFaH6pUPnD2iIUjyxjJZjE6zL6t0';
const ADMIN_ID = 'f3f90d95-4a9e-4f6b-be6a-70cd940935d5';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testando loadUserData para admin...');
  try {
    // 1. Load profile
    const { data: profile, error: pError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', ADMIN_ID)
      .single();

    if (pError) console.error('Erro profile:', pError.message);
    else console.log('Sucesso profile:', profile);

    // 2. Load permissions
    const { data: permissions, error: permError } = await supabase
      .from('user_module_permissions')
      .select(`
        *,
        modules:module_id (id, name, slug, icon, is_active, sort_order)
      `)
      .eq('user_id', ADMIN_ID);

    if (permError) console.error('Erro permissions:', permError.message);
    else console.log('Sucesso permissions! Total:', permissions.length);

  } catch (error) {
    console.error('Erro fatal:', error);
  }
}

test();
