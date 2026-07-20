import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';

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

  const itens = await fetchEstoquePorArmazem(warehouseCode);
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
}
