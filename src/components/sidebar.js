import { getCachedSession, signOut } from '../auth/auth.js';
import { canManageUsers, hasModuleAccess, getModuleIcon } from '../utils/permissions.js';
import { navigate, getCurrentRoute } from '../utils/router.js';

/**
 * Render sidebar
 */
export function renderSidebar() {
  const session = getCachedSession();
  const profile = session.profile;
  if (!profile) return '';

  const initials = profile.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const roleLabel = profile.role === 'super_admin' ? 'Super Admin'
    : profile.role === 'admin' ? 'Administrador' : 'Usuário';

  // Build menu items
  let menuItems = `
    <div class="sidebar-item ${getCurrentRoute() === '/dashboard' ? 'active' : ''}" data-route="/dashboard">
      <span class="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
      </span>
      <span>Dashboard</span>
    </div>
  `;

  // Admin section
  if (canManageUsers()) {
    menuItems += `
      <div class="sidebar-section-label">Administração</div>
      <div class="sidebar-item ${getCurrentRoute() === '/users' ? 'active' : ''}" data-route="/users">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </span>
        <span>Usuários (Gestores)</span>
      </div>
      <div class="sidebar-item ${getCurrentRoute() === '/apontadores' ? 'active' : ''}" data-route="/apontadores">
        <span class="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </span>
        <span>Apontadores (PINs)</span>
      </div>
    `;
  }

  // Module section
  const moduleItems = [];

  if (hasModuleAccess('logistica', 'can_view')) {
    moduleItems.push(`
      <div class="sidebar-item ${getCurrentRoute() === '/logistica' ? 'active' : ''}" data-route="/logistica">
        <span class="icon">${getModuleIcon('logistica')}</span>
        <span>Logística</span>
      </div>
    `);
  }

  if (hasModuleAccess('expedicao', 'can_view')) {
    moduleItems.push(`
      <div class="sidebar-item ${getCurrentRoute() === '/expedicao' ? 'active' : ''}" data-route="/expedicao">
        <span class="icon">${getModuleIcon('expedicao')}</span>
        <span>Expedição</span>
      </div>
    `);
  }

  if (hasModuleAccess('pcp', 'can_view')) {
    moduleItems.push(`
      <div class="sidebar-item ${getCurrentRoute() === '/pcp' ? 'active' : ''}" data-route="/pcp">
        <span class="icon">${getModuleIcon('pcp')}</span>
        <span>PCP</span>
      </div>
    `);
  }

  if (hasModuleAccess('seguranca', 'can_view')) {
    moduleItems.push(`
      <div class="sidebar-item ${getCurrentRoute() === '/seguranca' ? 'active' : ''}" data-route="/seguranca">
        <span class="icon">${getModuleIcon('seguranca')}</span>
        <span>Segurança</span>
      </div>
    `);
  }

  if (moduleItems.length > 0) {
    menuItems += `
      <div class="sidebar-section-label">Módulos</div>
      ${moduleItems.join('')}
    `;
  }

  return `
    <button class="mobile-menu-toggle" id="mobile-menu-toggle">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <img src="/assets/logo-icon.png" alt="Tableros" />
        <span>Tableros</span>
      </div>
      <nav class="sidebar-nav">
        ${menuItems}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-item ${getCurrentRoute() === '/profile' ? 'active' : ''}" data-route="/profile">
          <span class="icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </span>
          <span>Meu Perfil</span>
        </div>
        <div class="sidebar-item" id="sidebar-logout" style="color: rgba(255,255,255,0.45);">
          <span class="icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sidebar-icon"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          </span>
          <span>Sair</span>
        </div>
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${profile.full_name || 'Usuário'}</div>
            <div class="sidebar-user-role">${roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
  `;
}

/**
 * Bind sidebar events
 */
export function bindSidebarEvents() {
  // Navigation items
  document.querySelectorAll('.sidebar-item[data-route]').forEach(item => {
    // using onclick to prevent multiple listeners stacking on cached views
    item.onclick = () => {
      const route = item.dataset.route;
      navigate(route);
      closeMobileSidebar();
    };
  });

  // Logout
  document.querySelectorAll('#sidebar-logout').forEach(btn => {
    btn.onclick = async () => {
      await signOut();
      navigate('/login');
    };
  });

  // Mobile toggle
  document.querySelectorAll('#mobile-menu-toggle').forEach(toggle => {
    toggle.onclick = () => {
      const layout = toggle.closest('.app-layout');
      if (layout) {
        layout.querySelector('#sidebar')?.classList.toggle('open');
        layout.querySelector('#sidebar-overlay')?.classList.toggle('active');
      }
    };
  });

  document.querySelectorAll('#sidebar-overlay').forEach(overlay => {
    overlay.onclick = closeMobileSidebar;
  });
}

function closeMobileSidebar() {
  document.querySelectorAll('#sidebar').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('#sidebar-overlay').forEach(el => el.classList.remove('active'));
}
