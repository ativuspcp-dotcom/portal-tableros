import { getCachedSession, getRecentActivity, getAllUsers } from '../auth/auth.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { hasModuleAccess, canManageUsers, getModuleIcon } from '../utils/permissions.js';
import { navigate } from '../utils/router.js';

/**
 * Render dashboard page
 */
export async function renderDashboard(container = document.getElementById('view-dashboard') || document.getElementById('app')) {
  const app = container;
  const session = getCachedSession();
  const profile = session.profile;

  // Get stats
  let totalUsers = 0;
  let activeUsers = 0;
  let activities = [];

  if (canManageUsers()) {
    try {
      const users = await getAllUsers();
      totalUsers = users.length;
      activeUsers = users.filter(u => u.status === 'active').length;
    } catch (e) {
      console.error('Error fetching users:', e);
    }

    try {
      activities = await getRecentActivity(8);
    } catch (e) {
      console.error('Error fetching activity:', e);
    }
  }

  const greeting = getGreeting();

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Dashboard', 'Início')}
        <div class="page-content">
          <div style="margin-bottom: var(--space-8);">
            <h2 style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-extrabold); margin-bottom: var(--space-1);">
              ${greeting}, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!
            </h2>
            <p style="color: var(--color-text-secondary);">Bem-vindo ao Portal Tableros.</p>
          </div>

          ${canManageUsers() ? `
          <div class="stats-grid">
            <div class="card">
              <div class="stat-card">
                <div class="stat-card-icon green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </div>
                <div>
                  <div class="stat-card-value">${totalUsers}</div>
                  <div class="stat-card-label">Usuários Total</div>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="stat-card">
                <div class="stat-card-icon blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                <div>
                  <div class="stat-card-value">${activeUsers}</div>
                  <div class="stat-card-label">Usuários Ativos</div>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="stat-card">
                <div class="stat-card-icon orange">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
                <div>
                  <div class="stat-card-value">3</div>
                  <div class="stat-card-label">Módulos Ativos</div>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="stat-card">
                <div class="stat-card-icon purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
                </div>
                <div>
                  <div class="stat-card-value">${activities.length}</div>
                  <div class="stat-card-label">Atividades Hoje</div>
                </div>
              </div>
            </div>
          </div>
          ` : ''}

          <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); margin-bottom: var(--space-4);">
            Módulos Disponíveis
          </h3>

          <div class="modules-grid">
            ${hasModuleAccess('logistica', 'can_view') ? `
            <div class="module-card logistica" data-route="/logistica">
              <div class="module-card-icon">${getModuleIcon('logistica')}</div>
              <div class="module-card-title">Logística</div>
              <div class="module-card-desc">Gestão de veículos, empresas e motoristas</div>
            </div>
            ` : ''}

            ${hasModuleAccess('expedicao', 'can_view') ? `
            <div class="module-card expedicao" data-route="/expedicao">
              <div class="module-card-icon">${getModuleIcon('expedicao')}</div>
              <div class="module-card-title">Expedição</div>
              <div class="module-card-desc">Controle de expedição e despacho</div>
            </div>
            ` : ''}

            ${hasModuleAccess('pcp', 'can_view') ? `
            <div class="module-card pcp" data-route="/pcp">
              <div class="module-card-icon">${getModuleIcon('pcp')}</div>
              <div class="module-card-title">PCP</div>
              <div class="module-card-desc">Planejamento e Controle de Produção</div>
            </div>
            ` : ''}

            ${canManageUsers() ? `
            <div class="module-card admin" data-route="/users">
              <div class="module-card-icon">${getModuleIcon('admin')}</div>
              <div class="module-card-title">Administração</div>
              <div class="module-card-desc">Gestão de usuários e permissões</div>
            </div>
            ` : ''}
          </div>

          ${canManageUsers() && activities.length > 0 ? `
          <div class="card" style="margin-top: var(--space-4);">
            <div class="card-header">
              <h3 class="card-title">Atividade Recente</h3>
            </div>
            <div class="activity-feed">
              ${activities.map(a => `
                <div class="activity-item">
                  <div class="activity-dot"></div>
                  <div class="activity-text">
                    <strong>${a.user_profiles?.full_name || 'Sistema'}</strong> ${a.action}
                    ${a.module ? `em <strong>${a.module}</strong>` : ''}
                  </div>
                  <div class="activity-time">${formatTimeAgo(a.created_at)}</div>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();

  // Module card clicks
  document.querySelectorAll('.module-card[data-route]').forEach(card => {
    card.addEventListener('click', () => navigate(card.dataset.route));
  });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString('pt-BR');
}
