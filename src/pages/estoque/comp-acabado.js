import { supabase } from '../../config/supabase.js';

let estoqueCompAcabado = [];
let filteredEstoque = [];
let localFilter = '';

export async function fetchEstoqueCompAcabado() {
  try {
    const { data, error } = await supabase
      .from('amarracoes')
      .select('*')
      .eq('saida', false);

    if (error) throw error;
    
    estoqueCompAcabado = data || [];
    applyEstoqueFilters();
  } catch (error) {
    console.error('Erro ao buscar estoque comp acabado:', error);
  }
}

export function applyEstoqueFilters() {
  const localSelect = document.getElementById('filter-local-estoque');
  if (localSelect) {
    localFilter = localSelect.value;
  }

  if (!localFilter) {
    filteredEstoque = estoqueCompAcabado;
  } else {
    filteredEstoque = estoqueCompAcabado.filter(item => item.local_estoque === localFilter);
  }

  renderEstoqueDashboard();
}

export function renderEstoqueCompAcabadoView() {
  // Renderiza a estrutura inicial
  return `
    <div id="estoque-dashboard-container">
      <div style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
        Carregando painel de estoque...
      </div>
    </div>
  `;
}

export function renderEstoqueDashboard() {
  const container = document.getElementById('estoque-dashboard-container');
  if (!container) return;

  const locais = [...new Set(estoqueCompAcabado.map(i => i.local_estoque).filter(Boolean))].sort();

  const totalFardos = filteredEstoque.length;
  const totalM3 = filteredEstoque.reduce((acc, curr) => acc + (parseFloat(curr.total_calc) || 0), 0);
  
  // Agrupar por qualidade
  const byQualidade = filteredEstoque.reduce((acc, curr) => {
    const qual = curr.qualidade || 'N/A';
    if (!acc[qual]) acc[qual] = { fardos: 0, m3: 0 };
    acc[qual].fardos++;
    acc[qual].m3 += parseFloat(curr.total_calc) || 0;
    return acc;
  }, {});

  const qualityCards = Object.entries(byQualidade).sort((a,b) => b[1].m3 - a[1].m3).map(([qual, data]) => `
    <div class="card" style="padding: var(--space-4); border-color: var(--color-border); background: var(--color-surface); flex: 1; min-width: 200px;">
      <h4 style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2); display: flex; align-items: center; justify-content: space-between;">
        Qualidade
        <span class="badge" style="background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-text);">${qual}</span>
      </h4>
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: var(--space-3);">
        <div>
          <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text); line-height: 1.2;">
            ${data.fardos} <span style="font-size: var(--font-size-xs); font-weight: normal; color: var(--color-text-secondary);">caixas</span>
          </div>
          <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-primary); margin-top: 4px;">
            ${data.m3.toFixed(3)} m³
          </div>
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <!-- Toolbar -->
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <select class="filter-select" id="filter-local-estoque" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todos os Locais</option>
          ${locais.map(l => `<option value="${l}" ${localFilter === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary btn-sm btn-icon" id="btn-refresh-estoque" title="Atualizar Estoque" style="width: 34px; height: 34px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
        </button>
      </div>
    </div>

    <!-- Top KPI Cards -->
    <div style="display: flex; gap: var(--space-4); margin-bottom: var(--space-6); flex-wrap: wrap;">
      <div class="card" style="padding: var(--space-4); border-color: var(--color-primary); background: rgba(59, 130, 246, 0.05); flex: 1; min-width: 240px; border-left: 4px solid var(--color-primary);">
        <h4 style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2); display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          Total Caixas / Fardos
        </h4>
        <div style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-text);">${totalFardos}</div>
      </div>
      <div class="card" style="padding: var(--space-4); border-color: var(--color-primary); background: rgba(59, 130, 246, 0.05); flex: 1; min-width: 240px; border-left: 4px solid var(--color-primary);">
        <h4 style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2); display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
          Volume Total (m³)
        </h4>
        <div style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-text);">${totalM3.toFixed(3)} m³</div>
      </div>
    </div>

    <!-- Grouped By Quality -->
    <h3 style="font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); color: var(--color-text); margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">Estoque por Qualidade</h3>
    <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-6);">
      ${qualityCards || '<div style="color: var(--color-text-secondary); font-size: var(--font-size-sm);">Nenhum dado encontrado para os filtros selecionados.</div>'}
    </div>
    
    <!-- Grouped by Item (Table) -->
    <h3 style="font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); color: var(--color-text); margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">Detalhamento por Item</h3>
    <div class="card" style="padding: 0; overflow: hidden; border-color: var(--color-border); background: var(--color-surface);">
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs);">Cód. Item</th>
              <th style="font-size: var(--font-size-xs);">Descrição</th>
              <th style="font-size: var(--font-size-xs);">Qualidade</th>
              <th style="font-size: var(--font-size-xs); text-align: right;">Caixas</th>
              <th style="font-size: var(--font-size-xs); text-align: right;">Volume (m³)</th>
            </tr>
          </thead>
          <tbody style="font-size: var(--font-size-sm);">
            ${renderEstoqueItemTable()}
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindEstoqueCompAcabadoEvents();
}

function renderEstoqueItemTable() {
  const byItem = filteredEstoque.reduce((acc, curr) => {
    const key = curr.cod_item || 'N/A';
    if (!acc[key]) {
      acc[key] = {
        nome: curr.nome_item,
        qualidade: curr.qualidade || 'N/A',
        fardos: 0,
        m3: 0
      };
    }
    acc[key].fardos++;
    acc[key].m3 += parseFloat(curr.total_calc) || 0;
    return acc;
  }, {});

  const rows = Object.entries(byItem).sort((a,b) => b[1].m3 - a[1].m3);

  if (rows.length === 0) {
    return `<tr><td colspan="5" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum detalhe disponível.</td></tr>`;
  }

  return rows.map(([cod, data]) => `
    <tr>
      <td style="font-family: monospace; font-weight: var(--font-weight-semibold); color: var(--color-text);">${cod}</td>
      <td style="font-weight: var(--font-weight-medium); color: var(--color-text);">${data.nome || '-'}</td>
      <td><span class="badge" style="background: var(--color-surface-alt); color: var(--color-text-secondary);">${data.qualidade}</span></td>
      <td style="text-align: right; font-weight: var(--font-weight-semibold);">${data.fardos}</td>
      <td style="text-align: right; color: var(--color-primary); font-weight: var(--font-weight-semibold);">${data.m3.toFixed(3)}</td>
    </tr>
  `).join('');
}

export function bindEstoqueCompAcabadoEvents() {
  const filterLocal = document.getElementById('filter-local-estoque');
  if (filterLocal) {
    filterLocal.addEventListener('change', () => {
      applyEstoqueFilters();
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-estoque');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      btnRefresh.style.opacity = '0.5';
      fetchEstoqueCompAcabado().then(() => {
        btnRefresh.style.opacity = '1';
      });
    });
  }
}
