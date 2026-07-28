import { getCachedSession } from '../auth/auth.js';
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

            ${hasModuleAccess('seguranca', 'can_view') ? `
            <div class="module-card seguranca" data-route="/seguranca">
              <div class="module-card-icon">${getModuleIcon('seguranca')}</div>
              <div class="module-card-title">Segurança</div>
              <div class="module-card-desc">Gestão de segurança do trabalho e EPIs</div>
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
