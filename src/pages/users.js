import {
  getAllUsers, getModules, createUser, updateUserProfile,
  updateUserPermissions, deleteUser, getCachedSession
} from '../auth/auth.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import {
  getRoleLabel, getRoleBadgeClass, getStatusLabel,
  getStatusBadgeClass, getModuleBadgeClass, isSuperAdmin
} from '../utils/permissions.js';

let allUsers = [];
let allModules = [];
let filteredUsers = [];

/**
 * Render users management page
 */
export async function renderUsers(container = document.getElementById('view-users') || document.getElementById('app')) {
  const app = container;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Gestão de Usuários', 'Administração')}
        <div class="page-content">
          <div class="toolbar">
            <div class="toolbar-left">
              <div class="search-bar" style="flex:1; max-width:320px;">
                <span class="search-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </span>
                <input type="text" id="user-search" placeholder="Buscar por nome ou email..." />
              </div>
              <select class="filter-select" id="filter-role">
                <option value="">Todos os Roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Administrador</option>
                <option value="user">Usuário</option>
                <option value="app_tablet">Tablet / Totem (App)</option>
              </select>
              <select class="filter-select" id="filter-status">
                <option value="">Todos os Status</option>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary" id="btn-new-user">
                <span>+</span> Novo Usuário
              </button>
            </div>
          </div>

          <div class="card" style="padding: 0; overflow: hidden;">
            <div class="table-wrapper" id="users-table-wrapper">
              <div style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
                Carregando usuários...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();

  // Load data
  try {
    [allUsers, allModules] = await Promise.all([getAllUsers(), getModules()]);
    filteredUsers = [...allUsers];
    renderUsersTable();
  } catch (e) {
    console.error('Error loading users:', e);
    showToast('Erro ao carregar usuários', 'error');
  }

  // Events
  document.getElementById('btn-new-user').addEventListener('click', () => openUserModal());
  document.getElementById('user-search').addEventListener('input', filterUsers);
  document.getElementById('filter-role').addEventListener('change', filterUsers);
  document.getElementById('filter-status').addEventListener('change', filterUsers);
}

function filterUsers() {
  const search = document.getElementById('user-search').value.toLowerCase();
  const role = document.getElementById('filter-role').value;
  const status = document.getElementById('filter-status').value;

  filteredUsers = allUsers.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search) ||
      u.email?.toLowerCase().includes(search);
    const matchRole = !role || u.role === role;
    const matchStatus = !status || u.status === status;
    return matchSearch && matchRole && matchStatus;
  });

  renderUsersTable();
}

function renderUsersTable() {
  const wrapper = document.getElementById('users-table-wrapper');

  if (filteredUsers.length === 0) {
    wrapper.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-light); margin-bottom: var(--space-4);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <div class="empty-state-title">Nenhum usuário encontrado</div>
        <div class="empty-state-desc">Ajuste os filtros ou crie um novo usuário.</div>
      </div>
    `;
    return;
  }

  wrapper.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Usuário</th>
          <th>Role</th>
          <th>Módulos</th>
          <th>Status</th>
          <th>Último Acesso</th>
          <th style="text-align:right;">Ações</th>
        </tr>
      </thead>
      <tbody>
        ${filteredUsers.map(user => {
          const initials = user.full_name
            ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            : 'U';

          const modules = user.user_module_permissions
            ?.filter(p => p.can_view && p.modules)
            .map(p => `<span class="badge ${getModuleBadgeClass(p.modules.slug)}">${p.modules.name}</span>`)
            .join(' ') || '<span style="color:var(--color-text-light);font-size:var(--font-size-xs);">Nenhum</span>';

          const lastAccess = user.last_sign_in
            ? new Date(user.last_sign_in).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '—';

          const currentSession = getCachedSession();
          const isCurrentUser = user.id === currentSession.profile?.id;

          return `
            <tr>
              <td>
                <div class="user-cell">
                  <div class="user-cell-avatar">${initials}</div>
                  <div class="user-cell-info">
                    <div class="user-cell-name">${user.full_name || '—'}</div>
                    <div class="user-cell-email">${user.email}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge ${getRoleBadgeClass(user.role)}">${getRoleLabel(user.role)}</span></td>
              <td>${modules}</td>
              <td><span class="badge badge-dot ${getStatusBadgeClass(user.status)}">${getStatusLabel(user.status)}</span></td>
              <td style="color:var(--color-text-secondary);font-size:var(--font-size-sm);">${lastAccess}</td>
              <td style="text-align:right;">
                <div style="display:flex;gap:var(--space-1);justify-content:flex-end;">
                  <button class="btn btn-ghost btn-sm btn-edit-user" data-id="${user.id}" title="Editar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  ${user.status === 'active'
                    ? `<button class="btn btn-ghost btn-sm btn-toggle-user" data-id="${user.id}" data-action="deactivate" title="Desativar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                       </button>`
                    : `<button class="btn btn-ghost btn-sm btn-toggle-user" data-id="${user.id}" data-action="activate" title="Ativar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22,4 12,14.01 9,11.01"></polyline></svg>
                       </button>`
                  }
                  ${isSuperAdmin() && !isCurrentUser
                    ? `<button class="btn btn-ghost btn-sm btn-delete-user" data-id="${user.id}" title="Excluir" style="color:var(--color-danger);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                       </button>`
                    : ''
                  }
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  // Bind action buttons
  document.querySelectorAll('.btn-edit-user').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = allUsers.find(u => u.id === btn.dataset.id);
      if (user) openUserModal(user);
    });
  });

  document.querySelectorAll('.btn-toggle-user').forEach(btn => {
    btn.addEventListener('click', () => toggleUserStatus(btn.dataset.id, btn.dataset.action));
  });

  document.querySelectorAll('.btn-delete-user').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteUser(btn.dataset.id));
  });
}

function openUserModal(existingUser = null) {
  const isEdit = !!existingUser;
  const title = isEdit ? 'Editar Usuário' : 'Novo Usuário';

  // Get existing permissions
  const userPerms = {};
  if (existingUser?.user_module_permissions) {
    existingUser.user_module_permissions.forEach(p => {
      if (p.modules) {
        userPerms[p.modules.id || p.module_id] = {
          can_view: p.can_view,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
        };
      }
    });
  }

  const bodyHTML = `
    <div class="form-group" style="margin-bottom: var(--space-4);">
      <label class="form-label">Tipo de Conta (Role) <span class="required">*</span></label>
      <select class="form-select" id="modal-role" style="width:100%; border-color: var(--color-primary); background-color: var(--color-background-alt);">
        <option value="user" ${existingUser?.role === 'user' ? 'selected' : ''}>Usuário do Portal</option>
        <option value="admin" ${existingUser?.role === 'admin' ? 'selected' : ''}>Administrador do Portal</option>
        <option value="app_tablet" ${existingUser?.role === 'app_tablet' ? 'selected' : ''}>Tablet / Totem (App Operacional)</option>
        ${isSuperAdmin() ? `<option value="super_admin" ${existingUser?.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>` : ''}
      </select>
    </div>

    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label">Nome de Exibição / Identificação <span class="required">*</span></label>
        <input type="text" class="form-input" id="modal-fullname" value="${existingUser?.full_name || ''}" placeholder="Ex: Tablet Amarração 01" required />
      </div>
      <div class="form-group">
        <label class="form-label" id="label-email">E-mail <span class="required">*</span></label>
        <input type="text" class="form-input" id="modal-email" value="${existingUser?.email ? (existingUser.role === 'app_tablet' ? existingUser.email.replace('@app.tableros.com', '') : existingUser.email) : ''}" placeholder="email@empresa.com" ${isEdit ? 'disabled style="opacity:0.6"' : ''} required />
        <small id="hint-email" style="display:none; color:var(--color-text-light); font-size: 0.8rem; margin-top: 4px;">Sufixo @app.tableros.com será adicionado automaticamente.</small>
      </div>
      ${!isEdit ? `
      <div class="form-group">
        <label class="form-label">Senha de Acesso <span class="required">*</span></label>
        <input type="text" class="form-input" id="modal-password" value="" placeholder="Mínimo 8 caracteres" required />
      </div>
      ` : ''}
    </div>
    
    <div id="portal-extra-fields" class="form-grid-2">
      <div class="form-group">
        <label class="form-label">Departamento</label>
        <input type="text" class="form-input" id="modal-department" value="${existingUser?.department || ''}" placeholder="Ex: TI, Logística" />
      </div>
      <div class="form-group">
        <label class="form-label">Cargo</label>
        <input type="text" class="form-input" id="modal-jobtitle" value="${existingUser?.job_title || ''}" placeholder="Ex: Analista, Coordenador" />
      </div>
    </div>

    <div style="border-top: 1px solid var(--color-border); padding-top: var(--space-4); margin-top: var(--space-2);">
      <label class="form-label" style="margin-bottom: var(--space-3); display: block;">Filiais Permitidas <span class="required">*</span></label>
      <div style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4);">
        <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer;">
          <input type="checkbox" class="filial-checkbox" value="1" ${(existingUser?.filiais_permitidas || [1]).includes(1) ? 'checked' : ''} /> Tableros PAL (1)
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer;">
          <input type="checkbox" class="filial-checkbox" value="3" ${(existingUser?.filiais_permitidas || []).includes(3) ? 'checked' : ''} /> Tableros OTC (3)
        </label>
        <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer;">
          <input type="checkbox" class="filial-checkbox" value="4" ${(existingUser?.filiais_permitidas || []).includes(4) ? 'checked' : ''} /> Tableros SFP (4)
        </label>
      </div>
      
      <label class="form-label" style="margin-bottom: var(--space-3); display: block;">Permissões por Módulo</label>
      
      <div id="permissions-portal">
        <h4 style="margin-bottom: 8px; font-size: 0.9rem; color: var(--color-text-secondary);">Módulos do Portal Administrativo</h4>
        <div class="permission-header">
          <span></span>
          <span>Ver</span>
          <span>Criar</span>
          <span>Editar</span>
          <span>Excluir</span>
        </div>
        <div class="permission-grid">
          ${allModules.filter(m => m.slug !== 'admin' && m.type !== 'app').map(mod => {
            const perms = userPerms[mod.id] || {};
            return `
              <div class="permission-module">
                <div class="permission-module-name">
                  <span class="badge ${getModuleBadgeClass(mod.slug)}" style="padding:2px 8px;">${mod.name}</span>
                </div>
                ${['can_view', 'can_create', 'can_edit', 'can_delete'].map(perm => `
                  <div class="permission-check">
                    <div class="checkbox-wrapper">
                      <input type="checkbox" data-module="${mod.id}" data-perm="${perm}" ${perms[perm] ? 'checked' : ''} />
                      <span class="checkmark"></span>
                    </div>
                  </div>
                `).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div id="permissions-app" style="display: none; margin-top: 16px;">
        <h4 style="margin-bottom: 8px; font-size: 0.9rem; color: var(--color-primary);">Módulos do App Operacional (Tablets)</h4>
        
        ${['Laminação', 'Secagem', 'Colagem', 'Acabamento', 'Expedição', 'Qualidade'].map(group => {
            const groupMods = allModules.filter(m => m.type === 'app' && m.group_name === group);
            if (groupMods.length === 0) return '';
            return `
              <div style="margin-top: 16px;">
                <strong style="display: block; font-size: 0.95rem; margin-bottom: 8px; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border); padding-bottom: 4px;">${group}</strong>
                <div class="permission-header">
                  <span></span>
                  <span>Ver</span>
                  <span>Criar</span>
                  <span>Editar</span>
                  <span>Excluir</span>
                </div>
                <div class="permission-grid">
                  ${groupMods.map(mod => {
                    const perms = userPerms[mod.id] || {};
                    return `
                      <div class="permission-module">
                        <div class="permission-module-name">
                          <span class="badge" style="background: var(--color-background-alt); color: var(--color-text); padding:2px 8px; border: 1px solid var(--color-border);">${mod.name}</span>
                        </div>
                        ${['can_view', 'can_create', 'can_edit', 'can_delete'].map(perm => `
                          <div class="permission-check">
                            <div class="checkbox-wrapper">
                              <input type="checkbox" data-module="${mod.id}" data-perm="${perm}" ${perms[perm] ? 'checked' : ''} />
                              <span class="checkmark"></span>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
      </div>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
    <button class="btn btn-primary" id="modal-save-user">${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}</button>
  `;

  openModal(title, bodyHTML, footerHTML, { maxWidth: '640px' });

  document.getElementById('modal-save-user').addEventListener('click', () => {
    handleSaveUser(existingUser);
  });

  const roleSelect = document.getElementById('modal-role');
  const portalSection = document.getElementById('permissions-portal');
  const appSection = document.getElementById('permissions-app');
  const labelEmail = document.getElementById('label-email');
  const inputEmail = document.getElementById('modal-email');
  const hintEmail = document.getElementById('hint-email');
  const extraFields = document.getElementById('portal-extra-fields');

  function togglePermissions() {
    if (roleSelect.value === 'app_tablet') {
      portalSection.style.display = 'none';
      appSection.style.display = 'block';
      labelEmail.innerHTML = 'Nome de Usuário (Username) <span class="required">*</span>';
      inputEmail.placeholder = 'Ex: tablet.amarracao';
      hintEmail.style.display = 'block';
      extraFields.style.display = 'none';
    } else {
      portalSection.style.display = 'block';
      appSection.style.display = 'none';
      labelEmail.innerHTML = 'E-mail <span class="required">*</span>';
      inputEmail.placeholder = 'email@empresa.com';
      hintEmail.style.display = 'none';
      extraFields.style.display = 'grid';
    }
  }

  roleSelect.addEventListener('change', togglePermissions);
  togglePermissions();
}

async function handleSaveUser(existingUser) {
  const isEdit = !!existingUser;
  const fullName = document.getElementById('modal-fullname').value.trim();
  let email = document.getElementById('modal-email')?.value.trim();
  const password = document.getElementById('modal-password')?.value;
  const role = document.getElementById('modal-role').value;
  const department = document.getElementById('modal-department').value.trim();
  const jobTitle = document.getElementById('modal-jobtitle').value.trim();

  if (email && role === 'app_tablet' && !isEdit) {
    if (!email.includes('@')) {
      email = `${email}@app.tableros.com`;
    }
  }

  if (!fullName) {
    showToast('Nome é obrigatório', 'error');
    return;
  }

  if (!isEdit && (!email || !password)) {
    showToast('E-mail e senha são obrigatórios', 'error');
    return;
  }

  if (!isEdit && password.length < 8) {
    showToast('A senha deve ter pelo menos 8 caracteres', 'error');
    return;
  }

  // Collect permissions
  const modulePermissions = [];
  document.querySelectorAll('.permission-module').forEach(row => {
    const checkboxes = row.querySelectorAll('input[type="checkbox"], input[type="hidden"]');
    if (checkboxes.length === 0) return;

    const moduleId = checkboxes[0].dataset.module;
    const perms = {};
    checkboxes.forEach(cb => {
      if (cb.type === 'checkbox') {
        perms[cb.dataset.perm] = cb.checked;
      } else if (cb.type === 'hidden') {
        // Only set hidden permissions if the main checkbox is checked (for App modules)
        const mainCheckbox = Array.from(checkboxes).find(c => c.type === 'checkbox' && c.dataset.module === moduleId);
        if (mainCheckbox && mainCheckbox.checked) {
          perms[cb.dataset.perm] = cb.value === 'true';
        }
      }
    });

    // Only add if at least one permission
    if (Object.values(perms).some(v => v)) {
      modulePermissions.push({ module_id: moduleId, ...perms });
    }
  });

  // Collect filiais permitidas
  const filiaisPermitidas = Array.from(document.querySelectorAll('.filial-checkbox:checked'))
    .map(cb => parseInt(cb.value));

  if (filiaisPermitidas.length === 0) {
    showToast('Selecione pelo menos uma filial permitida', 'error');
    return;
  }

  const saveBtn = document.getElementById('modal-save-user');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  try {
    if (isEdit) {
      // Update profile
      await updateUserProfile(existingUser.id, {
        full_name: fullName,
        role,
        department: department || null,
        job_title: jobTitle || null,
        filiais_permitidas: filiaisPermitidas
      });

      // Update permissions
      await updateUserPermissions(existingUser.id, modulePermissions);

      showToast('Usuário atualizado com sucesso!', 'success');
    } else {
      // Create user via Edge Function
      await createUser({
        email,
        password,
        full_name: fullName,
        role,
        department: department || null,
        job_title: jobTitle || null,
        filiais_permitidas: filiaisPermitidas,
        module_permissions: modulePermissions,
      });

      showToast('Usuário criado com sucesso!', 'success');
    }

    closeModal();

    // Reload
    allUsers = await getAllUsers();
    filteredUsers = [...allUsers];
    filterUsers();
  } catch (e) {
    console.error('Error saving user:', e);
    showToast(e.message || 'Erro ao salvar usuário', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = isEdit ? 'Salvar Alterações' : 'Criar Usuário';
  }
}

async function toggleUserStatus(userId, action) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  const newStatus = action === 'activate' ? 'active' : 'inactive';
  const actionLabel = action === 'activate' ? 'ativar' : 'desativar';

  confirmDialog(
    `${action === 'activate' ? 'Ativar' : 'Desativar'} Usuário`,
    `Tem certeza que deseja ${actionLabel} <strong>${user.full_name}</strong>?`,
    async () => {
      try {
        await updateUserProfile(userId, { status: newStatus });
        showToast(`Usuário ${actionLabel === 'ativar' ? 'ativado' : 'desativado'}!`, 'success');

        allUsers = await getAllUsers();
        filteredUsers = [...allUsers];
        filterUsers();
      } catch (e) {
        showToast('Erro ao alterar status', 'error');
      }
    },
    { type: action === 'activate' ? 'warning' : 'danger', confirmText: action === 'activate' ? 'Ativar' : 'Desativar' }
  );
}

async function handleDeleteUser(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  confirmDialog(
    'Excluir Usuário',
    `Tem certeza que deseja excluir permanentemente <strong>${user.full_name}</strong>? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        await deleteUser(userId);
        showToast('Usuário excluído com sucesso', 'success');

        allUsers = await getAllUsers();
        filteredUsers = [...allUsers];
        filterUsers();
      } catch (e) {
        showToast('Erro ao excluir usuário', 'error');
      }
    },
    { confirmText: 'Excluir Permanentemente' }
  );
}
