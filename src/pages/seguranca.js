import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { hasModuleAccess } from '../utils/permissions.js';
import { supabase } from '../config/supabase.js';
import { getCachedSession, getBPLID } from '../auth/auth.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { printFichaEntregaEPI } from '../components/ficha-entrega-epi-report.js';

let activeMainTab = sessionStorage.getItem('segurancaActiveMainTab') || 'cadastro_itens';
let activeSubTab = sessionStorage.getItem('segurancaActiveSubTab') || 'interno';

const SAP_FETCH_OPTIONS = {
  headers: {
    'ngrok-skip-browser-warning': 'true',
    'Prefer': 'odata.maxpagesize=0',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  },
};

let cadastroItensCache = null;
let estoqueInternoCache = null;
let estoqueCdCache = null;
let funcionariosCache = [];

let funcSearchFilter = '';
let funcSetorFilter = '';
let funcTurnoFilter = '';
let funcFuncaoFilter = '';
let funcStatusFilter = '';

/**
 * Render Segurança (EPIs) page
 */
export async function renderSeguranca(container = document.getElementById('view-seguranca') || document.getElementById('app')) {
  const app = container;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Segurança', 'Módulos')}
        <div class="page-content" style="padding-top: var(--space-4);">

          <!-- Primary Level 1 Navigation Tabs -->
          <div class="seguranca-primary-tabs" style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: 0;">
            <button class="seguranca-main-tab-btn ${activeMainTab === 'cadastro_itens' ? 'active' : ''}" data-tab="cadastro_itens"
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'cadastro_itens' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'cadastro_itens' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'cadastro_itens' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'cadastro_itens' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Cadastro de Itens
            </button>
            <button class="seguranca-main-tab-btn ${activeMainTab === 'estoque' ? 'active' : ''}" data-tab="estoque"
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'estoque' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'estoque' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'estoque' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'estoque' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Estoque
            </button>
            <button class="seguranca-main-tab-btn ${activeMainTab === 'funcionarios' ? 'active' : ''}" data-tab="funcionarios"
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'funcionarios' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'funcionarios' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'funcionarios' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'funcionarios' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Funcionários
            </button>
          </div>

          <!-- Secondary Navigation Tabs -->
          ${activeMainTab === 'estoque' ? `
            <div class="seguranca-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              <button class="seguranca-sub-tab-btn ${activeSubTab === 'interno' ? 'active' : ''}" data-subtab="interno"
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'interno' ? '600' : '400'}; color: ${activeSubTab === 'interno' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'interno' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Estoque Interno
              </button>
              <button class="seguranca-sub-tab-btn ${activeSubTab === 'cd' ? 'active' : ''}" data-subtab="cd"
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'cd' ? '600' : '400'}; color: ${activeSubTab === 'cd' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'cd' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Estoque CD
              </button>
            </div>
          ` : ''}

          <!-- Tab Content -->
          <div id="seguranca-tab-content">
            ${activeMainTab === 'cadastro_itens' ? renderCadastroItensTab() : ''}
            ${activeMainTab === 'estoque' ? renderEstoqueTab() : ''}
            ${activeMainTab === 'funcionarios' ? renderFuncionariosTab() : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindSegurancaEvents();

  if (activeMainTab === 'cadastro_itens') {
    loadCadastroItensTab();
  } else if (activeMainTab === 'estoque') {
    const warehouseCode = activeSubTab === 'interno' ? 'EPI' : 'GERAL';
    loadEstoqueTab(warehouseCode);
  } else if (activeMainTab === 'funcionarios') {
    loadFuncionariosTab();
  }
}

function renderCadastroItensTab() {
  return `
    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="table-wrapper" id="seguranca-cadastro-wrapper">
        <div style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">Carregando itens...</div>
      </div>
    </div>
  `;
}

function renderEstoqueTab() {
  return `
    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="table-wrapper" id="seguranca-estoque-wrapper">
        <div style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">Carregando estoque...</div>
      </div>
    </div>
  `;
}

function renderFuncionariosTab() {
  const canCreate = hasModuleAccess('seguranca', 'can_create');
  return `
    <div class="toolbar" style="margin-bottom: var(--space-4);">
      <div class="toolbar-left">
        <h2 style="font-size: var(--font-size-xl); margin: 0;">Funcionários</h2>
      </div>
      <div class="toolbar-right" style="display: flex; gap: var(--space-2);">
        <button class="btn btn-secondary" id="btn-novo-funcionario" ${canCreate ? '' : 'disabled'}>
          <span>+</span> Novo Funcionário
        </button>
        <button class="btn btn-primary" id="btn-nova-entrega" ${canCreate ? '' : 'disabled'}>
          <span>+</span> Nova Entrega
        </button>
      </div>
    </div>
    <div id="seguranca-funcionarios-container">
      <div style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">Carregando funcionários...</div>
    </div>
  `;
}

async function fetchCadastroItens() {
  if (cadastroItensCache) return cadastroItensCache;
  try {
    const url = "https://tableros.ngrok.app/Items?$select=ItemCode,ItemName&$filter=Properties1 eq 'tYES' and U_Class eq '101'";
    const res = await fetch(url, SAP_FETCH_OPTIONS);
    if (res.ok) {
      const data = await res.json();
      cadastroItensCache = data.value || [];
    }
  } catch (e) {
    console.error('Erro ao buscar cadastro de itens de segurança', e);
  }
  return cadastroItensCache || [];
}

let itensPropriedade1Cache = null;

// Todos os itens com Properties1='tYES' (qualquer U_Class) — usado só pelo Estoque Interno
async function fetchItensProperties1() {
  if (itensPropriedade1Cache) return itensPropriedade1Cache;
  try {
    const url = "https://tableros.ngrok.app/Items?$select=ItemCode,ItemName&$filter=Properties1 eq 'tYES'";
    const res = await fetch(url, SAP_FETCH_OPTIONS);
    if (res.ok) {
      const data = await res.json();
      itensPropriedade1Cache = data.value || [];
    }
  } catch (e) {
    console.error('Erro ao buscar itens (Properties1=tYES)', e);
  }
  return itensPropriedade1Cache || [];
}

// Lê um campo que pode vir com aspas literais na chave (peculiaridade do SQLQueries do SAP)
function readAliased(row, name) {
  return row[name] !== undefined ? row[name] : row[`'${name}'`];
}

async function fetchEstoquePorArmazem(warehouseCode) {
  const cache = warehouseCode === 'EPI' ? estoqueInternoCache : estoqueCdCache;
  if (cache) return cache;

  let result = [];
  try {
    // Elegibilidade (nome do item + filtro de negócio) e saldo por armazém são
    // independentes entre si (nenhuma passa por supabase-js) — buscar em paralelo.
    const url = `https://tableros.ngrok.app/SQLQueries('SegurancaEstoquePorArmazem')/List?WhsCode='${warehouseCode}'`;
    const [itensElegiveis, res] = await Promise.all([
      warehouseCode === 'EPI' ? fetchItensProperties1() : fetchCadastroItens(),
      fetch(url, SAP_FETCH_OPTIONS),
    ]);
    const nomesPorCodigo = new Map(itensElegiveis.map((i) => [i.ItemCode, i.ItemName]));

    if (res.ok) {
      const data = await res.json();
      for (const row of data.value || []) {
        const nome = nomesPorCodigo.get(row.ItemCode);
        if (nome === undefined) continue; // não é item de segurança elegível
        result.push({
          ItemCode: row.ItemCode,
          ItemName: nome,
          InStock: readAliased(row, 'InStock'),
          Committed: readAliased(row, 'Committed'),
          Ordered: readAliased(row, 'Ordered'),
          MinimalStock: readAliased(row, 'MinimalStock'),
          MaximalStock: readAliased(row, 'MaximalStock'),
        });
      }
    }
  } catch (e) {
    console.error(`Erro ao buscar estoque do armazém ${warehouseCode}`, e);
  }

  if (warehouseCode === 'EPI') estoqueInternoCache = result;
  else estoqueCdCache = result;
  return result;
}

async function loadCadastroItensTab() {
  const wrapper = document.getElementById('seguranca-cadastro-wrapper');
  if (!wrapper) return;

  const itens = await fetchCadastroItens();
  if (itens.length === 0) {
    wrapper.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Nenhum item encontrado</div>
        <div class="empty-state-desc">Nenhum item com U_Class = 101 retornado pelo SAP.</div>
      </div>
    `;
    return;
  }

  wrapper.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Nome do Item</th>
        </tr>
      </thead>
      <tbody>
        ${itens
          .map(
            (i) => `
          <tr>
            <td style="font-family:monospace;">${i.ItemCode}</td>
            <td>${i.ItemName}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

async function loadEstoqueTab(warehouseCode) {
  const wrapper = document.getElementById('seguranca-estoque-wrapper');
  if (!wrapper) return;

  const itens = [...(await fetchEstoquePorArmazem(warehouseCode))].sort((a, b) => a.ItemName.localeCompare(b.ItemName, 'pt-BR'));
  if (itens.length === 0) {
    wrapper.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Nenhum item com saldo</div>
        <div class="empty-state-desc">Nenhum item com estoque no armazém "${warehouseCode}" retornado pelo SAP.</div>
      </div>
    `;
    return;
  }

  wrapper.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Nome do Item</th>
          <th style="text-align:right;">Em Estoque</th>
          <th style="text-align:right;">Comprometido</th>
          <th style="text-align:right;">Pedido</th>
          <th style="text-align:right;">Estoque Mínimo</th>
          <th style="text-align:right;">Estoque Máximo</th>
        </tr>
      </thead>
      <tbody>
        ${itens
          .map(
            (i) => `
          <tr>
            <td style="font-family:monospace;">${i.ItemCode}</td>
            <td>${i.ItemName}</td>
            <td style="text-align:right;">${i.InStock}</td>
            <td style="text-align:right;">${i.Committed}</td>
            <td style="text-align:right;">${i.Ordered}</td>
            <td style="text-align:right;">${i.MinimalStock}</td>
            <td style="text-align:right;">${i.MaximalStock}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

async function loadFuncionariosTab() {
  const container = document.getElementById('seguranca-funcionarios-container');
  if (!container) return;

  const { data, error } = await supabase.from('seguranca_funcionarios').select('*').order('nome');
  if (error) {
    console.error('Erro ao buscar funcionários', error);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Erro ao carregar funcionários</div></div>`;
    return;
  }

  funcionariosCache = data || [];
  renderFuncionariosContent();
}

// Valores distintos já usados em `field` nos funcionários cadastrados, para alimentar dropdowns (modal e filtros)
function distinctFuncionarioValues(field) {
  return [...new Set(funcionariosCache.map((f) => f[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function getFilteredFuncionarios() {
  const search = funcSearchFilter.toLowerCase().trim();
  return funcionariosCache.filter((f) => {
    const matchSearch = !search || f.codigo.toLowerCase().includes(search) || f.nome.toLowerCase().includes(search);
    const matchSetor = !funcSetorFilter || f.setor === funcSetorFilter;
    const matchTurno = !funcTurnoFilter || f.turno === funcTurnoFilter;
    const matchFuncao = !funcFuncaoFilter || f.funcao === funcFuncaoFilter;
    const matchStatus = !funcStatusFilter || f.status === funcStatusFilter;
    return matchSearch && matchSetor && matchTurno && matchFuncao && matchStatus;
  });
}

function applyFuncionarioFilters() {
  funcSearchFilter = document.getElementById('func-search')?.value ?? funcSearchFilter;
  funcSetorFilter = document.getElementById('func-filter-setor')?.value ?? funcSetorFilter;
  funcTurnoFilter = document.getElementById('func-filter-turno')?.value ?? funcTurnoFilter;
  funcFuncaoFilter = document.getElementById('func-filter-funcao')?.value ?? funcFuncaoFilter;
  funcStatusFilter = document.getElementById('func-filter-status')?.value ?? funcStatusFilter;
  renderFuncionariosContent();
}

function renderFuncionariosContent() {
  const container = document.getElementById('seguranca-funcionarios-container');
  if (!container) return;

  const canEdit = hasModuleAccess('seguranca', 'can_edit');
  const filtrados = getFilteredFuncionarios();

  const searchInputActive = document.activeElement?.id === 'func-search';
  const cursorPos = searchInputActive ? document.activeElement.selectionStart : null;

  if (funcionariosCache.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 0; overflow: hidden;">
        <div class="empty-state">
          <div class="empty-state-title">Nenhum funcionário cadastrado</div>
          <div class="empty-state-desc">Cadastre o primeiro funcionário pra começar a registrar entregas de EPI.</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <div style="position: relative; width: 240px; max-width: 100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--color-text-secondary);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="func-search" class="form-input" placeholder="Buscar por código ou nome..." value="${funcSearchFilter.replace(/"/g, '&quot;')}" style="padding-left: 32px; font-size: var(--font-size-sm); height: 34px; width: 100%;">
        </div>
        <select class="filter-select" id="func-filter-setor" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todos os Setores</option>
          ${distinctFuncionarioValues('setor').map((s) => `<option value="${s}" ${funcSetorFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select class="filter-select" id="func-filter-turno" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todos os Turnos</option>
          ${distinctFuncionarioValues('turno').map((t) => `<option value="${t}" ${funcTurnoFilter === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <select class="filter-select" id="func-filter-funcao" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todas as Funções</option>
          ${distinctFuncionarioValues('funcao').map((f) => `<option value="${f}" ${funcFuncaoFilter === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
        <select class="filter-select" id="func-filter-status" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Ativos e Inativos</option>
          <option value="ativo" ${funcStatusFilter === 'ativo' ? 'selected' : ''}>Somente Ativos</option>
          <option value="inativo" ${funcStatusFilter === 'inativo' ? 'selected' : ''}>Somente Inativos</option>
        </select>
      </div>
    </div>
    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="table-wrapper">
        ${filtrados.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-title">Nenhum funcionário encontrado</div>
            <div class="empty-state-desc">Ajuste os filtros pra ver outros resultados.</div>
          </div>
        ` : `
        <table class="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Setor</th>
              <th>Turno</th>
              <th>Função</th>
              <th>Status</th>
              <th style="width: 180px;"></th>
            </tr>
          </thead>
          <tbody>
            ${filtrados
              .map(
                (f) => `
              <tr>
                <td style="font-family:monospace;">${f.codigo}</td>
                <td>${f.nome}</td>
                <td>${f.setor || '-'}</td>
                <td>${f.turno || '-'}</td>
                <td>${f.funcao || '-'}</td>
                <td><span class="badge badge-${f.status === 'ativo' ? 'green' : 'gray'}">${f.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn btn-secondary btn-sm btn-ficha-funcionario" data-id="${f.id}">Ficha</button>
                  ${canEdit ? `<button class="btn btn-secondary btn-sm btn-editar-funcionario" data-id="${f.id}">Editar</button>` : ''}
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        `}
      </div>
    </div>
  `;

  if (searchInputActive) {
    const searchInput = document.getElementById('func-search');
    searchInput.focus();
    searchInput.setSelectionRange(cursorPos, cursorPos);
  }

  bindFuncionariosContentEvents();
}

function bindFuncionariosContentEvents() {
  document.getElementById('func-search')?.addEventListener('input', applyFuncionarioFilters);
  document.getElementById('func-filter-setor')?.addEventListener('change', applyFuncionarioFilters);
  document.getElementById('func-filter-turno')?.addEventListener('change', applyFuncionarioFilters);
  document.getElementById('func-filter-funcao')?.addEventListener('change', applyFuncionarioFilters);
  document.getElementById('func-filter-status')?.addEventListener('change', applyFuncionarioFilters);

  document.querySelectorAll('.btn-ficha-funcionario').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = funcionariosCache.find((x) => x.id === btn.dataset.id);
      if (f) showFichaFuncionarioModal(f);
    });
  });

  document.querySelectorAll('.btn-editar-funcionario').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = funcionariosCache.find((x) => x.id === btn.dataset.id);
      if (f) showFuncionarioModal(f);
    });
  });
}

// Combo com opção "+ Nova opção..." que revela um input de texto (sempre maiúsculo) pra cadastrar um valor novo na hora
function comboFieldHTML(prefix, label, options, currentValue) {
  return `
    <div class="form-group">
      <label class="form-label">${label} <span class="required">*</span></label>
      <select class="form-select" id="func-${prefix}" required>
        <option value="">Selecione...</option>
        ${options.map((o) => `<option value="${o}" ${o === currentValue ? 'selected' : ''}>${o}</option>`).join('')}
        <option value="__novo__">+ Nova opção...</option>
      </select>
      <input type="text" class="form-input" id="func-${prefix}-novo" placeholder="Digite o novo valor" style="margin-top:8px; display:none; text-transform:uppercase;">
    </div>
  `;
}

function bindComboField(prefix) {
  const select = document.getElementById(`func-${prefix}`);
  const novoInput = document.getElementById(`func-${prefix}-novo`);

  select.addEventListener('change', () => {
    const isNovo = select.value === '__novo__';
    novoInput.style.display = isNovo ? 'block' : 'none';
    novoInput.required = isNovo;
    if (isNovo) novoInput.focus();
  });

  novoInput.addEventListener('input', () => {
    const pos = novoInput.selectionStart;
    novoInput.value = novoInput.value.toUpperCase();
    novoInput.setSelectionRange(pos, pos);
  });
}

function getComboValue(prefix) {
  const select = document.getElementById(`func-${prefix}`);
  if (select.value === '__novo__') {
    return document.getElementById(`func-${prefix}-novo`).value.trim().toUpperCase();
  }
  return select.value;
}

function showFuncionarioModal(existing = null) {
  const isEdit = !!existing;

  const bodyHTML = `
    <form id="funcionario-form">
      <div class="form-group">
        <label class="form-label">Código <span class="required">*</span></label>
        <input type="text" class="form-input" id="func-codigo" value="${existing?.codigo || ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Nome <span class="required">*</span></label>
        <input type="text" class="form-input" id="func-nome" value="${existing?.nome || ''}" required>
      </div>
      ${comboFieldHTML('setor', 'Setor', distinctFuncionarioValues('setor'), existing?.setor || '')}
      ${comboFieldHTML('turno', 'Turno', distinctFuncionarioValues('turno'), existing?.turno || '')}
      ${comboFieldHTML('funcao', 'Função', distinctFuncionarioValues('funcao'), existing?.funcao || '')}
      <div class="form-group">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="func-status" ${!isEdit || existing?.status === 'ativo' ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--color-primary);" />
          <span>Funcionário Ativo</span>
        </label>
      </div>
      <div style="margin-top: var(--space-5); display:flex; justify-content:flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-funcionario">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm" id="btn-save-funcionario">${isEdit ? 'Salvar Alterações' : 'Criar Funcionário'}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? 'Editar Funcionário' : 'Novo Funcionário', bodyHTML);

  document.getElementById('btn-cancel-funcionario').addEventListener('click', closeModal);
  bindComboField('setor');
  bindComboField('turno');
  bindComboField('funcao');

  document.getElementById('funcionario-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveFuncionario(existing?.id);
  });
}

async function saveFuncionario(editId) {
  const btn = document.getElementById('btn-save-funcionario');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Salvando...';

  const payload = {
    codigo: document.getElementById('func-codigo').value.trim(),
    nome: document.getElementById('func-nome').value.trim(),
    setor: getComboValue('setor'),
    turno: getComboValue('turno'),
    funcao: getComboValue('funcao'),
    status: document.getElementById('func-status').checked ? 'ativo' : 'inativo',
  };

  if (!payload.codigo || !payload.nome || !payload.setor || !payload.turno || !payload.funcao) {
    showToast('Preencha todos os campos obrigatórios.', 'error');
    btn.disabled = false;
    btn.innerText = originalText;
    return;
  }

  try {
    if (editId) {
      payload.updated_at = new Date().toISOString();
      const { error } = await supabase.from('seguranca_funcionarios').update(payload).eq('id', editId);
      if (error) throw error;
      showToast('Funcionário atualizado!', 'success');
    } else {
      const { error } = await supabase.from('seguranca_funcionarios').insert([payload]);
      if (error) throw error;
      showToast('Funcionário cadastrado!', 'success');
    }
    closeModal();
    await loadFuncionariosTab();
  } catch (err) {
    console.error(err);
    const msg = err.code === '23505' ? 'Já existe um funcionário com esse código.' : 'Erro ao salvar funcionário.';
    showToast(msg, 'error');
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

async function showNovaEntregaModal() {
  const [itens, estoqueEPI, funcionariosResp] = await Promise.all([
    fetchCadastroItens(),
    fetchEstoquePorArmazem('EPI'),
    supabase.from('seguranca_funcionarios').select('*').eq('status', 'ativo').order('nome'),
  ]);

  const funcionariosAtivos = funcionariosResp.data || [];

  if (funcionariosAtivos.length === 0) {
    showToast('Cadastre ao menos um funcionário ativo antes de registrar uma entrega.', 'error');
    return;
  }
  if (itens.length === 0) {
    showToast('Nenhum item de EPI encontrado no Cadastro de Itens.', 'error');
    return;
  }

  const funcOptions = '<option value="">Selecione...</option>' +
    funcionariosAtivos.map((f) => `<option value="${f.id}">${f.codigo} - ${f.nome}</option>`).join('');

  const bodyHTML = `
    <form id="entrega-form">
      <div class="form-group">
        <label class="form-label">Funcionário <span class="required">*</span></label>
        <select class="form-select" id="entrega-funcionario" required>${funcOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Itens Entregues <span class="required">*</span></label>
        <table class="table" style="margin-top: 8px;">
          <thead>
            <tr>
              <th>Item</th>
              <th style="width: 120px;">Quantidade</th>
              <th style="width: 40px;"></th>
            </tr>
          </thead>
          <tbody id="entrega-items-tbody"></tbody>
        </table>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-add-entrega-item" style="margin-top: 8px;">+ Adicionar Item</button>
      </div>
      <div class="form-group">
        <label class="form-label">Observação</label>
        <textarea class="form-input" id="entrega-observacao" rows="2"></textarea>
      </div>
      <div style="margin-top: var(--space-5); display:flex; justify-content:flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-entrega">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm" id="btn-save-entrega">Confirmar Entrega</button>
      </div>
    </form>
  `;

  openModal('Nova Entrega de EPI', bodyHTML, '', { maxWidth: '720px' });

  document.getElementById('btn-cancel-entrega').addEventListener('click', closeModal);

  const estoqueMap = new Map(estoqueEPI.map((i) => [i.ItemCode, Number(i.InStock) || 0]));
  const itemOptions = '<option value="">Selecione...</option>' +
    itens.map((i) => `<option value="${i.ItemCode}" data-nome="${i.ItemName}">${i.ItemCode} - ${i.ItemName}</option>`).join('');

  function addEntregaItemRow() {
    const tbody = document.getElementById('entrega-items-tbody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select class="form-select entrega-item-select" required>${itemOptions}</select></td>
      <td><input type="number" class="form-input entrega-item-qtd" min="0.01" step="0.01" value="1" required></td>
      <td><button type="button" class="btn btn-icon btn-remove-entrega-item">✕</button></td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById('btn-add-entrega-item').addEventListener('click', addEntregaItemRow);
  document.getElementById('entrega-items-tbody').addEventListener('click', (e) => {
    if (e.target.closest('.btn-remove-entrega-item')) {
      e.target.closest('tr').remove();
    }
  });
  addEntregaItemRow();

  document.getElementById('entrega-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveEntrega(funcionariosAtivos, estoqueMap);
  });
}

async function saveEntrega(funcionariosAtivos, estoqueMap) {
  const btn = document.getElementById('btn-save-entrega');
  const originalText = btn.innerText;
  const funcionarioId = document.getElementById('entrega-funcionario').value;
  const observacao = document.getElementById('entrega-observacao').value.trim() || null;

  if (!funcionarioId) {
    showToast('Selecione um funcionário.', 'error');
    return;
  }

  const rows = Array.from(document.querySelectorAll('#entrega-items-tbody tr'));
  const linhas = [];
  for (const row of rows) {
    const select = row.querySelector('.entrega-item-select');
    const qtdInput = row.querySelector('.entrega-item-qtd');
    const itemCode = select.value;
    const quantidade = parseFloat(qtdInput.value);
    if (!itemCode || !quantidade || quantidade <= 0) continue;
    linhas.push({
      item_code: itemCode,
      item_name: select.options[select.selectedIndex].dataset.nome,
      quantidade,
    });
  }

  if (linhas.length === 0) {
    showToast('Adicione ao menos um item com quantidade válida.', 'error');
    return;
  }

  // Aviso (não bloqueia) se algum item pedir mais do que o estoque disponível no cache local
  const semEstoque = linhas.filter((l) => l.quantidade > (estoqueMap.get(l.item_code) || 0));
  if (semEstoque.length > 0) {
    const nomes = semEstoque.map((l) => `${l.item_code} (pedido: ${l.quantidade}, em estoque: ${estoqueMap.get(l.item_code) || 0})`).join(', ');
    const continuar = window.confirm(`Atenção: quantidade pedida maior que o estoque disponível para: ${nomes}.\n\nDeseja continuar mesmo assim?`);
    if (!continuar) return;
  }

  btn.disabled = true;
  btn.innerText = 'Registrando no SAP...';

  const payload = {
    BPL_IDAssignedToInvoice: getBPLID(),
    DocumentLines: linhas.map((l) => ({
      ItemCode: l.item_code,
      Quantity: l.quantidade,
      WarehouseCode: 'EPI',
    })),
  };

  try {
    const { data, error } = await supabase.functions.invoke('baixa-estoque-epi', { body: payload });
    if (error) throw error;

    if (data?.sapRejected) {
      showToast(`SAP recusou a baixa: ${data.sapMessage || data.error}`, 'error');
      btn.disabled = false;
      btn.innerText = originalText;
      return;
    }

    const sapDocEntry = data?.data?.DocEntry ?? null;
    const sapDocNum = data?.data?.DocNum ?? null;
    const session = getCachedSession();

    const { data: entregaInserida, error: entregaError } = await supabase
      .from('seguranca_entregas')
      .insert([{
        funcionario_id: funcionarioId,
        registrado_por: session?.user?.id || null,
        sap_doc_entry: sapDocEntry ? String(sapDocEntry) : null,
        sap_doc_num: sapDocNum ? String(sapDocNum) : null,
        observacao,
      }])
      .select()
      .single();
    if (entregaError) throw entregaError;

    const { error: itensError } = await supabase
      .from('seguranca_entrega_itens')
      .insert(linhas.map((l) => ({ entrega_id: entregaInserida.id, ...l })));
    if (itensError) throw itensError;

    estoqueInternoCache = null; // invalida pra refletir o saldo novo na aba Estoque

    closeModal();
    showToast('Entrega registrada com sucesso!', 'success');

    const funcionario = funcionariosAtivos.find((f) => f.id === funcionarioId);
    confirmDialog(
      'Imprimir Ficha?',
      'Deseja imprimir a ficha de entrega para colher a assinatura do funcionário agora?',
      { type: 'info', confirmText: 'Imprimir', cancelText: 'Agora não' }
    ).then((confirmado) => {
      if (confirmado && funcionario) {
        printFichaEntregaEPI({
          funcionario: { codigo: funcionario.codigo, nome: funcionario.nome },
          data_entrega: entregaInserida.data_entrega,
          sap_doc_num: sapDocNum,
          itens: linhas,
        });
      }
    });

    await loadFuncionariosTab();
  } catch (err) {
    console.error(err);
    showToast('Erro ao registrar entrega: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

async function showFichaFuncionarioModal(funcionario) {
  const bodyHTML = `
    <div style="margin-bottom: var(--space-4);">
      <div style="font-weight:600; font-size: var(--font-size-lg);">${funcionario.nome}</div>
      <div style="color: var(--color-text-secondary); font-size: var(--font-size-sm);">Código: ${funcionario.codigo}</div>
    </div>
    <div id="ficha-funcionario-historico">
      <div style="padding: var(--space-6); text-align:center; color: var(--color-text-secondary);">Carregando histórico...</div>
    </div>
  `;

  openModal('Ficha do Funcionário', bodyHTML, '', { maxWidth: '720px' });

  const { data: entregas, error } = await supabase
    .from('seguranca_entregas')
    .select('*, seguranca_entrega_itens(*)')
    .eq('funcionario_id', funcionario.id)
    .order('data_entrega', { ascending: false });

  const wrapper = document.getElementById('ficha-funcionario-historico');
  if (!wrapper) return; // modal já foi fechado antes da resposta chegar

  if (error) {
    console.error(error);
    wrapper.innerHTML = `<div class="empty-state"><div class="empty-state-title">Erro ao carregar histórico</div></div>`;
    return;
  }

  if (!entregas || entregas.length === 0) {
    wrapper.innerHTML = `<div class="empty-state"><div class="empty-state-title">Nenhuma entrega registrada</div></div>`;
    return;
  }

  wrapper.innerHTML = entregas.map((entrega) => `
    <div class="card" style="padding: var(--space-4); margin-bottom: var(--space-3);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--space-2);">
        <div>
          <strong>${new Date(entrega.data_entrega).toLocaleString('pt-BR')}</strong>
          ${entrega.sap_doc_num ? `<span style="color: var(--color-text-secondary); font-size: var(--font-size-sm);"> — Doc SAP: ${entrega.sap_doc_num}</span>` : ''}
        </div>
        <button class="btn btn-secondary btn-sm btn-reimprimir-entrega" data-entrega-id="${entrega.id}">Reimprimir</button>
      </div>
      <table class="table">
        <tbody>
          ${entrega.seguranca_entrega_itens.map((i) => `
            <tr><td style="font-family:monospace;">${i.item_code}</td><td>${i.item_name}</td><td style="text-align:right;">${i.quantidade}</td></tr>
          `).join('')}
        </tbody>
      </table>
      ${entrega.observacao ? `<div style="margin-top:8px; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Obs: ${entrega.observacao}</div>` : ''}
    </div>
  `).join('');

  wrapper.querySelectorAll('.btn-reimprimir-entrega').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entrega = entregas.find((e) => e.id === btn.dataset.entregaId);
      if (!entrega) return;
      printFichaEntregaEPI({
        funcionario: { codigo: funcionario.codigo, nome: funcionario.nome },
        data_entrega: entrega.data_entrega,
        sap_doc_num: entrega.sap_doc_num,
        itens: entrega.seguranca_entrega_itens,
      });
    });
  });
}

function bindSegurancaEvents() {
  document.querySelectorAll('.seguranca-main-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.dataset.tab;
      if (targetTab !== activeMainTab) {
        activeMainTab = targetTab;
        sessionStorage.setItem('segurancaActiveMainTab', activeMainTab);
        renderSeguranca();
      }
    });
  });

  document.querySelectorAll('.seguranca-sub-tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetSubTab = e.currentTarget.dataset.subtab;
      if (targetSubTab !== activeSubTab) {
        activeSubTab = targetSubTab;
        sessionStorage.setItem('segurancaActiveSubTab', activeSubTab);
        renderSeguranca();
      }
    });
  });

  const btnNovoFuncionario = document.getElementById('btn-novo-funcionario');
  if (btnNovoFuncionario) btnNovoFuncionario.addEventListener('click', () => showFuncionarioModal());

  const btnNovaEntrega = document.getElementById('btn-nova-entrega');
  if (btnNovaEntrega) btnNovaEntrega.addEventListener('click', () => showNovaEntregaModal());
}
