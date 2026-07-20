import { getCachedSession } from '../auth/auth.js';

/**
 * Check if user has access to a module with a specific action
 */
export function hasModuleAccess(moduleSlug, action = 'can_view') {
  const session = getCachedSession();
  if (!session.profile) return false;

  // Super admin and admin have access to everything
  if (session.profile.role === 'super_admin') return true;
  if (session.profile.role === 'admin' && moduleSlug !== 'admin') return true;

  // Check module permissions
  const perm = session.permissions?.find(
    p => p.modules?.slug === moduleSlug
  );

  if (!perm) return false;
  return perm[action] === true;
}

/**
 * Get all modules the user has access to
 */
export function getUserModules() {
  const session = getCachedSession();
  if (!session.profile) return [];

  // Super admin sees everything
  if (session.profile.role === 'super_admin' || session.profile.role === 'admin') {
    return session.permissions?.map(p => p.modules).filter(Boolean) || [];
  }

  return session.permissions
    ?.filter(p => p.can_view)
    .map(p => p.modules)
    .filter(Boolean) || [];
}

/**
 * Check if user can manage users
 */
export function canManageUsers() {
  const session = getCachedSession();
  if (!session.profile) return false;
  return ['super_admin', 'admin'].includes(session.profile.role);
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin() {
  const session = getCachedSession();
  return session.profile?.role === 'super_admin';
}

/**
 * Get role display label
 */
export function getRoleLabel(role) {
  const labels = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    user: 'Usuário'
  };
  return labels[role] || role;
}

/**
 * Get role badge class
 */
export function getRoleBadgeClass(role) {
  const classes = {
    super_admin: 'badge-purple',
    admin: 'badge-blue',
    user: 'badge-gray'
  };
  return classes[role] || 'badge-gray';
}

/**
 * Get status display label
 */
export function getStatusLabel(status) {
  const labels = {
    active: 'Ativo',
    inactive: 'Inativo',
    pending: 'Pendente'
  };
  return labels[status] || status;
}

/**
 * Get status badge class
 */
export function getStatusBadgeClass(status) {
  const classes = {
    active: 'badge-green',
    inactive: 'badge-red',
    pending: 'badge-yellow'
  };
  return classes[status] || 'badge-gray';
}

/**
 * Get module badge class by slug
 */
export function getModuleBadgeClass(slug) {
  const classes = {
    admin: 'badge-module-admin',
    logistica: 'badge-module-logistica',
    expedicao: 'badge-module-expedicao',
    pcp: 'badge-module-pcp'
  };
  return classes[slug] || 'badge-gray';
}

/**
 * Get module icon by slug
 * Returns unified modern geometric SVG icons instead of disparate emojis
 */
export function getModuleIcon(slug) {
  if (slug === 'admin') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
  }
  
  if (slug === 'logistica') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`;
  }
  
  if (slug === 'expedicao') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon><polygon points="12 12 21 6.92 21 17.08 12 22.08"></polygon><polygon points="12 2 3 6.92 12 12 21 6.92 12 2"></polygon><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
  }
  
  if (slug === 'pcp') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M2 20h20"></path><path d="M5 17V7l7 5V7l7 5v5H5z"></path></svg>`;
  }

  if (slug === 'seguranca') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"></path></svg>`;
  }
  
  // Sleek geometric diamond shape fallback
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M12 2L2 12l10 10 10-10L12 2z"></path></svg>`;
}
