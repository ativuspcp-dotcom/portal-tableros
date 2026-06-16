import { supabase } from '../config/supabase.js';

/** @type {{ user: object|null, profile: object|null, permissions: object[] }} */
let currentSession = { user: null, profile: null, permissions: [] };
let currentBPLID = localStorage.getItem('tableros_bplid') ? parseInt(localStorage.getItem('tableros_bplid')) : 1;

export function getBPLID() {
  return currentBPLID;
}

export function setBPLID(id) {
  currentBPLID = parseInt(id);
  localStorage.setItem('tableros_bplid', currentBPLID);
  window.location.reload();
}

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Load profile and permissions
  await loadUserData(data.user.id);
  return data;
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentSession = { user: null, profile: null, permissions: [] };
  localStorage.removeItem('tableros_bplid');
}

/**
 * Get current user session with profile and permissions
 */
export async function getCurrentSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      currentSession = { user: null, profile: null, permissions: [] };
      return null;
    }

    if (!currentSession.profile) {
      await loadUserData(session.user.id);
    }

    return { ...currentSession, user: session.user };
  } catch (err) {
    console.error('Fatal error inside getCurrentSession:', err);
    throw err;
  }
}

let loadUserDataPromise = null;

/**
 * Load user profile and module permissions (deduplicated)
 */
async function loadUserData(userId, force = false) {
  if (!force && currentSession.profile && currentSession.profile.id === userId) {
    return;
  }

  if (loadUserDataPromise) {
    return loadUserDataPromise;
  }

  loadUserDataPromise = (async () => {
    // Load profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Load permissions with module info
    const { data: permissions } = await supabase
      .from('user_module_permissions')
      .select(`
        *,
        modules:module_id (id, name, slug, icon, is_active, sort_order)
      `)
      .eq('user_id', userId);

    currentSession.profile = profile;
    currentSession.permissions = permissions || [];

    // Ensure currentBPLID is allowed for this user
    if (profile && profile.filiais_permitidas && profile.filiais_permitidas.length > 0) {
      if (!profile.filiais_permitidas.includes(currentBPLID)) {
        currentBPLID = profile.filiais_permitidas[0];
        localStorage.setItem('tableros_bplid', currentBPLID);
      }
    } else {
      // Default fallback if no filiais_permitidas array exists yet
      currentSession.profile.filiais_permitidas = [1];
      if (currentBPLID !== 1) {
        currentBPLID = 1;
        localStorage.setItem('tableros_bplid', 1);
      }
    }

    // Update last_sign_in
    await supabase
      .from('user_profiles')
      .update({ last_sign_in: new Date().toISOString() })
      .eq('id', userId);
  })();

  try {
    await loadUserDataPromise;
  } finally {
    loadUserDataPromise = null;
  }
}

/**
 * Get cached session (no re-fetch)
 */
export function getCachedSession() {
  return currentSession;
}

/**
 * Listen for auth state changes
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
      // Run loadUserData asynchronously without blocking the GoTrue initialization callback!
      // This immediately releases the GoTrue lock, allowing all database queries to succeed.
      loadUserData(session.user.id).then(() => {
        callback('SIGNED_IN', { ...currentSession, user: session.user });
      }).catch(err => {
        console.error('Error in onAuthStateChange loadUserData:', err);
      });
    } else if (event === 'SIGNED_OUT') {
      currentSession = { user: null, profile: null, permissions: [] };
      callback('SIGNED_OUT', null);
    }
  });
}

export async function createUser(userData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${supabase.supabaseUrl}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro desconhecido na Edge Function');
    }

    return data;
  } catch (err) {
    console.error('Error in createUser:', err);
    throw err;
  }
}

/**
 * Update user profile (admin)
 */
export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update user module permissions (admin)
 */
export async function updateUserPermissions(userId, modulePermissions) {
  // Delete existing permissions
  await supabase
    .from('user_module_permissions')
    .delete()
    .eq('user_id', userId);

  // Insert new permissions
  if (modulePermissions.length > 0) {
    const session = getCachedSession();
    const records = modulePermissions.map(p => ({
      user_id: userId,
      module_id: p.module_id,
      can_view: p.can_view || false,
      can_create: p.can_create || false,
      can_edit: p.can_edit || false,
      can_delete: p.can_delete || false,
      granted_by: session.profile?.id
    }));

    const { error } = await supabase
      .from('user_module_permissions')
      .insert(records);

    if (error) throw error;
  }
}

/**
 * Get all users with permissions (admin)
 */
export async function getAllUsers() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(`
      *,
      user_module_permissions!user_module_permissions_user_id_fkey (
        *,
        modules:module_id (id, name, slug, icon)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get all modules
 */
export async function getModules() {
  const { data, error } = await supabase
    .from('modules')
    .select('*')
    .order('sort_order');

  if (error) throw error;
  return data || [];
}

/**
 * Log activity
 */
export async function logActivity(action, module, details) {
  const session = getCachedSession();
  await supabase.from('activity_log').insert({
    user_id: session.user?.id || session.profile?.id,
    action,
    module,
    details
  });
}

/**
 * Get recent activity (admin)
 */
export async function getRecentActivity(limit = 10) {
  const { data, error } = await supabase
    .from('activity_log')
    .select(`
      *,
      user_profiles:user_id (full_name, email)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Delete user (super_admin only)
 */
export async function deleteUser(userId) {
  // Delete from auth (cascade deletes profile and permissions)
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { action: 'delete', userId },
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) throw error;
  return data;
}

/**
 * Update own password
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
