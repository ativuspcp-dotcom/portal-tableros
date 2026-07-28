import { getCachedSession, updatePassword } from '../auth/auth.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { getRoleLabel, getRoleBadgeClass, getModuleBadgeClass } from '../utils/permissions.js';

/**
 * Render profile page
 */
export async function renderProfile(container = document.getElementById('view-profile') || document.getElementById('app')) {
  const app = container;
  const session = getCachedSession();
  const profile = session.profile;

  if (!profile) {
    app.innerHTML = '<div style="padding: 2rem; text-align: center;">Carregando perfil...</div>';
    return;
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const userPerms = session.permissions || [];
  const moduleBadges = userPerms
    .filter(p => p.can_view && p.modules)
    .map(p => `<span class="badge ${getModuleBadgeClass(p.modules.slug)}">${p.modules.name}</span>`)
    .join(' ') || '<span style="color:var(--color-text-secondary);font-size:var(--font-size-xs);">Nenhum módulo com acesso</span>';

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Meu Perfil', 'Configurações')}
        <div class="page-content">
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-6); align-items: start;">
            
            <!-- Left Card: Avatar & Summary -->
            <div class="card" style="text-align: center;">
              <div class="user-cell-avatar" style="width: 80px; height: 80px; font-size: var(--font-size-xl); margin: 0 auto var(--space-4) auto;">
                ${initials}
              </div>
              <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); margin-bottom: var(--space-1);">
                ${profile.full_name}
              </h3>
              <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-3);">
                ${profile.email}
              </p>
              <div style="display: flex; justify-content: center; gap: var(--space-2); margin-bottom: var(--space-4);">
                <span class="badge ${getRoleBadgeClass(profile.role)}">${getRoleLabel(profile.role)}</span>
              </div>
              <div style="border-top: 1px solid var(--color-border); padding-top: var(--space-4); text-align: left;">
                <h4 style="font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2);">
                  Módulos Autorizados
                </h4>
                <div style="display: flex; flex-wrap: wrap; gap: var(--space-1);">
                  ${moduleBadges}
                </div>
              </div>
            </div>

            <!-- Right Card: Profile Details & Password Change -->
            <div style="display: flex; flex-direction: column; gap: var(--space-6);">
              
              <!-- Personal Details Card -->
              <div class="card">
                <div class="card-header">
                  <h3 class="card-title">Dados Pessoais</h3>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                  <div class="form-group">
                    <label class="form-label">Departamento</label>
                    <input type="text" class="form-input" value="${profile.department || 'Não informado'}" disabled style="opacity: 0.8; background-color: var(--color-surface-alt);" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Cargo</label>
                    <input type="text" class="form-input" value="${profile.job_title || 'Não informado'}" disabled style="opacity: 0.8; background-color: var(--color-surface-alt);" />
                  </div>
                </div>
              </div>

              <!-- Password Change Card -->
              <div class="card">
                <div class="card-header">
                  <h3 class="card-title">Alterar Senha</h3>
                </div>
                <form id="password-form" style="display: flex; flex-direction: column; gap: var(--space-4);">
                  <div class="form-group">
                    <label class="form-label" for="profile-new-password">Nova Senha</label>
                    <input type="password" id="profile-new-password" class="form-input" placeholder="Mínimo 8 caracteres" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="profile-confirm-password">Confirmar Nova Senha</label>
                    <input type="password" id="profile-confirm-password" class="form-input" placeholder="Mínimo 8 caracteres" required />
                  </div>
                  <div style="display: flex; justify-content: flex-end;">
                    <button type="submit" class="btn btn-primary" id="btn-save-password">
                      Atualizar Senha
                    </button>
                  </div>
                </form>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();

  // Bind password form
  document.getElementById('password-form').addEventListener('submit', handlePasswordUpdate);
}

async function handlePasswordUpdate(e) {
  e.preventDefault();

  const newPassword = document.getElementById('profile-new-password').value;
  const confirmPassword = document.getElementById('profile-confirm-password').value;
  const btn = document.getElementById('btn-save-password');

  if (newPassword.length < 8) {
    showToast('A senha deve ter pelo menos 8 caracteres', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('As senhas não coincidem', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Atualizando...';

  try {
    await updatePassword(newPassword);
    showToast('Senha atualizada com sucesso!', 'success');
    document.getElementById('password-form').reset();
  } catch (error) {
    console.error('Password update error:', error);
    showToast(error.message || 'Erro ao atualizar senha', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atualizar Senha';
  }
}
