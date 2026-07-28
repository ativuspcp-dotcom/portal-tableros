import { supabase } from '../config/supabase.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let apontadores = [];

export async function renderApontadores(container = document.getElementById('view-apontadores') || document.getElementById('app')) {
  const app = container;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Apontadores', 'Gestão de PINs para os terminais de apontamento')}
        <div class="page-content">
          <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; justify-content: space-between;">
            <div class="search-bar" style="max-width: 300px; flex: 1;">
              <span class="search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </span>
              <input type="text" id="apontadores-search" placeholder="Buscar apontador..." style="font-size: var(--font-size-sm);" />
            </div>
            <button class="btn btn-primary" id="btn-new-apontador">
              Novo Apontador
            </button>
          </div>

          <div class="card" style="padding: 0; overflow: hidden;">
            <div class="table-wrapper">
              <table class="table">
                <thead>
                  <tr>
                    <th>Nome Completo</th>
                    <th>PIN</th>
                    <th>Status</th>
                    <th style="width: 100px; text-align: center;">Ações</th>
                  </tr>
                </thead>
                <tbody id="apontadores-table-body">
                  <tr>
                    <td colspan="4" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">
                      Carregando apontadores...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  
  document.getElementById('btn-new-apontador').addEventListener('click', showApontadorModal);
  document.getElementById('apontadores-search').addEventListener('input', applySearch);

  await fetchApontadores();
}

async function fetchApontadores() {
  try {
    const { data: apons, error: aponsError } = await supabase
      .from('app_apontadores')
      .select('*')
      .order('criado_em', { ascending: false });

    if (aponsError) throw aponsError;

    apontadores = apons;
    renderTable();
  } catch (err) {
    console.error('Error fetching apontadores:', err);
    showToast('Erro ao buscar apontadores', 'error');
  }
}

function applySearch() {
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('apontadores-table-body');
  const query = document.getElementById('apontadores-search').value.toLowerCase();

  const filtered = apontadores.filter(op => 
    op.nome_completo.toLowerCase().includes(query) || 
    op.pin.includes(query)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">
          Nenhum apontador encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(op => {
    const statusBadge = op.status === 'ATIVO' 
      ? '<span class="badge badge-green">ATIVO</span>'
      : '<span class="badge badge-gray">INATIVO</span>';

    return `
      <tr>
        <td style="font-weight: 500;">${op.nome_completo}</td>
        <td style="font-family: monospace; letter-spacing: 2px;">${op.pin}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; justify-content: center; gap: 4px;">
            <button class="btn btn-danger btn-sm btn-icon btn-delete" data-id="${op.id}" title="Excluir" style="width: 26px; height: 26px; background: transparent; border: 1px solid var(--color-border); color: var(--color-danger);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });
}

async function handleDelete(id) {
  const op = apontadores.find(o => o.id == id);
  if (!op) return;

  const confirmed = await confirmDialog(
    'Excluir Apontador',
    `Tem certeza que deseja excluir o apontador <strong>${op.nome_completo}</strong>? O PIN ${op.pin} será invalidado nos totens.`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabase.from('app_apontadores').delete().eq('id', id);
    if (error) throw error;
    
    showToast('Apontador excluído com sucesso', 'success');
    await fetchApontadores();
  } catch (err) {
    console.error(err);
    showToast('Erro ao excluir apontador', 'error');
  }
}

function showApontadorModal() {
  const bodyHTML = `
    <form id="apontador-form">
      <div class="form-group">
        <label class="form-label">Nome Completo <span class="required">*</span></label>
        <input type="text" class="form-input" id="op-nome" placeholder="Ex: João da Silva" required />
      </div>
      <div class="form-group">
        <label class="form-label">PIN (Senha de 4 dígitos) <span class="required">*</span></label>
        <input type="text" class="form-input" id="op-pin" placeholder="Ex: 1234" pattern="\\d{4}" maxlength="4" required style="font-family: monospace; font-size: 1.2rem; letter-spacing: 4px;" />
        <small style="color: var(--color-text-secondary); font-size: 10px;">Somente números. Este PIN deve ser único na fábrica.</small>
      </div>

      <div class="modal-footer" style="margin-top: var(--space-4); margin-left: -24px; margin-right: -24px; margin-bottom: -24px;">
        <button type="button" class="btn btn-secondary" id="btn-cancel-op">Cancelar</button>
        <button type="submit" class="btn btn-primary">Cadastrar Apontador</button>
      </div>
    </form>
  `;

  openModal('Novo Apontador', bodyHTML);

  document.getElementById('btn-cancel-op').addEventListener('click', closeModal);
  document.getElementById('apontador-form').addEventListener('submit', handleCreateApontador);
}

async function handleCreateApontador(e) {
  e.preventDefault();
  const nome = document.getElementById('op-nome').value.trim();
  const pin = document.getElementById('op-pin').value;
  
  if (!/^\d{4}$/.test(pin)) {
    showToast('O PIN deve conter exatamente 4 números.', 'warning');
    return;
  }

  try {
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Criando...';

    const { error: opError } = await supabase.from('app_apontadores').insert({
      nome_completo: nome,
      pin: pin,
      status: 'ATIVO'
    });

    if (opError) {
      if (opError.code === '23505') { // Unique violation
        throw new Error('Este PIN já está em uso por outro apontador. Escolha outro.');
      }
      throw opError;
    }

    showToast('Apontador criado com sucesso!', 'success');
    closeModal();
    await fetchApontadores();

  } catch (err) {
    console.error(err);
    showToast(err.message || 'Erro ao criar apontador', 'error');
  } finally {
    const btn = document.querySelector('#apontador-form button[type="submit"]');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cadastrar Apontador';
    }
  }
}
