import { supabase } from '../../config/supabase.js';

let estoqueCompAcabado = [];
let filteredEstoque = [];
let localFilter = '';
let searchFilter = '';

const qualidadeOrder = {
  '-': 1,
  'N/A': 1,
  '': 1,
  'BG': 2,
  'SG': 3,
  '1ª PERMUTA': 4,
  '2ª QUALIDADE': 5,
  '3ª QUALIDADE': 6
};

function getQualidadeWeight(qual) {
  const q = qual ? qual.toUpperCase().trim() : '-';
  return qualidadeOrder[q] || 99;
}

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

  const searchInput = document.getElementById('search-estoque');
  if (searchInput) {
    searchFilter = searchInput.value.toLowerCase().trim();
  }

  filteredEstoque = estoqueCompAcabado.filter(item => {
    const matchLocal = !localFilter || item.local_estoque === localFilter;
    const matchSearch = !searchFilter || 
      (item.cod_item && item.cod_item.toLowerCase().includes(searchFilter)) || 
      (item.nome_item && item.nome_item.toLowerCase().includes(searchFilter));
    return matchLocal && matchSearch;
  });

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

  const searchInputActive = document.activeElement && document.activeElement.id === 'search-estoque';
  const cursorStart = searchInputActive ? document.activeElement.selectionStart : 0;
  const cursorEnd = searchInputActive ? document.activeElement.selectionEnd : 0;

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

  const qualityCards = Object.entries(byQualidade).sort((a,b) => {
    const qualA = (a[0] === 'N/A' || !a[0]) ? '-' : a[0];
    const qualB = (b[0] === 'N/A' || !b[0]) ? '-' : b[0];
    return getQualidadeWeight(qualA) - getQualidadeWeight(qualB);
  }).map(([qual, data]) => {
    const qualDisplay = (qual === 'N/A' || !qual) ? '-' : qual;
    const badgeStyle = qualDisplay !== '-' 
      ? (qual === 'BG' ? 'background: rgba(34, 197, 94, 0.15); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.3);'
        : qual === 'SG' ? 'background: rgba(59, 130, 246, 0.15); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.3);'
        : 'background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3);')
      : 'background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border);';

    return `
    <div class="card" style="padding: var(--space-4); border-color: var(--color-border); background: var(--color-surface); flex: 1; min-width: 200px;">
      <h4 style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2); display: flex; align-items: center; justify-content: space-between;">
        Qualidade
        <span class="badge" style="${badgeStyle}">${qualDisplay}</span>
      </h4>
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: var(--space-3);">
        <div>
          <div style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text); line-height: 1.2;">
            ${data.fardos} <span style="font-size: var(--font-size-xs); font-weight: normal; color: var(--color-text-secondary);">caixas</span>
          </div>
          <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-primary); margin-top: 4px;">
            ${data.m3.toFixed(3).replace('.', ',')} m³
          </div>
        </div>
      </div>
    </div>
  `}).join('');

  container.innerHTML = `
    <!-- Toolbar -->
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <div class="search-box" style="position: relative; width: 300px; max-width: 100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--color-text-secondary);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="search-estoque" class="form-input" placeholder="Buscar por código ou descrição..." value="${searchFilter.replace(/"/g, '&quot;')}" style="padding-left: 32px; font-size: var(--font-size-sm); height: 34px; width: 100%;">
        </div>
        <select class="filter-select" id="filter-local-estoque" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todos os Locais</option>
          ${locais.map(l => `<option value="${l}" ${localFilter === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-right" style="display: flex; gap: var(--space-2);">
        <button class="btn btn-secondary btn-sm btn-icon" id="btn-print-estoque" title="Imprimir Relatório" style="width: 34px; height: 34px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        </button>
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
        <div style="font-size: var(--font-size-3xl); font-weight: var(--font-weight-bold); color: var(--color-text);">${totalM3.toFixed(3).replace('.', ',')} m³</div>
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

  if (searchInputActive) {
    const newSearchInput = document.getElementById('search-estoque');
    if (newSearchInput) {
      newSearchInput.focus();
      newSearchInput.setSelectionRange(cursorStart, cursorEnd);
    }
  }

  bindEstoqueCompAcabadoEvents();
}

function getGroupedItemsForTable() {
  const byItem = filteredEstoque.reduce((acc, curr) => {
    const cod = curr.cod_item || 'N/A';
    const qual = curr.qualidade || 'N/A';
    const key = `${cod}_${qual}`;
    
    if (!acc[key]) {
      acc[key] = {
        cod: cod,
        nome: curr.nome_item,
        qualidade: qual,
        fardos: 0,
        m3: 0
      };
    }
    acc[key].fardos++;
    acc[key].m3 += parseFloat(curr.total_calc) || 0;
    return acc;
  }, {});

  return Object.values(byItem).sort((a,b) => {
    const qualA = (a.qualidade === 'N/A' || !a.qualidade) ? '-' : a.qualidade;
    const qualB = (b.qualidade === 'N/A' || !b.qualidade) ? '-' : b.qualidade;
    
    const weightA = getQualidadeWeight(qualA);
    const weightB = getQualidadeWeight(qualB);
    
    if (weightA !== weightB) {
      return weightA - weightB;
    }

    const nomeA = (a.nome || '').toLowerCase();
    const nomeB = (b.nome || '').toLowerCase();
    return nomeA.localeCompare(nomeB);
  });
}

function renderEstoqueItemTable() {
  const rows = getGroupedItemsForTable();

  if (rows.length === 0) {
    return `<tr><td colspan="5" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum detalhe disponível.</td></tr>`;
  }

  return rows.map((data) => {
    const qualDisplay = (data.qualidade === 'N/A' || !data.qualidade) ? '-' : data.qualidade;
    const badgeStyle = qualDisplay !== '-' 
      ? (data.qualidade === 'BG' ? 'background: rgba(34, 197, 94, 0.15); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.3);'
        : data.qualidade === 'SG' ? 'background: rgba(59, 130, 246, 0.15); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.3);'
        : 'background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3);')
      : 'background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border);';

    return `
    <tr>
      <td style="font-family: monospace; font-weight: var(--font-weight-semibold); color: var(--color-text);">${data.cod}</td>
      <td style="font-weight: var(--font-weight-medium); color: var(--color-text);">${data.nome || '-'}</td>
      <td><span class="badge" style="${badgeStyle}">${qualDisplay}</span></td>
      <td style="text-align: right; font-weight: var(--font-weight-semibold);">${data.fardos}</td>
      <td style="text-align: right; color: var(--color-primary); font-weight: var(--font-weight-semibold);">${data.m3.toFixed(3).replace('.', ',')}</td>
    </tr>
  `}).join('');
}

export function bindEstoqueCompAcabadoEvents() {
  const filterLocal = document.getElementById('filter-local-estoque');
  if (filterLocal) {
    filterLocal.addEventListener('change', () => {
      applyEstoqueFilters();
    });
  }

  const searchInput = document.getElementById('search-estoque');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
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

  const btnPrint = document.getElementById('btn-print-estoque');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      printEstoqueReport();
    });
  }
}

function printEstoqueReport() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permita pop-ups para gerar o relatório.');
    return;
  }

  const now = new Date().toLocaleString('pt-BR');
  const totalFardos = filteredEstoque.length;
  const totalM3 = filteredEstoque.reduce((acc, curr) => acc + (parseFloat(curr.total_calc) || 0), 0);
  
  const byQualidade = filteredEstoque.reduce((acc, curr) => {
    const qual = curr.qualidade || 'N/A';
    if (!acc[qual]) acc[qual] = { fardos: 0, m3: 0 };
    acc[qual].fardos++;
    acc[qual].m3 += parseFloat(curr.total_calc) || 0;
    return acc;
  }, {});

  const qualCardsHtml = Object.entries(byQualidade).sort((a,b) => {
    const qualA = (a[0] === 'N/A' || !a[0]) ? '-' : a[0];
    const qualB = (b[0] === 'N/A' || !b[0]) ? '-' : b[0];
    return getQualidadeWeight(qualA) - getQualidadeWeight(qualB);
  }).map(([qual, data]) => {
    const qualDisplay = (qual === 'N/A' || !qual) ? '-' : qual;
    const badgeStyle = qualDisplay !== '-' 
      ? (qual === 'BG' ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;'
        : qual === 'SG' ? 'background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe;'
        : 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;')
      : 'background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;';
      
    return `
      <div class="kpi-card" style="text-align: left;">
        <div class="kpi-label" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          Qualidade
          <span style="${badgeStyle} padding: 1px 4px; border-radius: 4px; font-size: 9px;">${qualDisplay}</span>
        </div>
        <div style="font-size: 16px; font-weight: bold; color: #111;">${data.fardos} <span style="font-size: 10px; font-weight: normal; color: #666;">cx</span></div>
        <div style="font-size: 12px; color: #2563eb; font-weight: bold; margin-top: 2px;">${data.m3.toFixed(3).replace('.', ',')} m³</div>
      </div>
    `;
  }).join('');
  
  const rows = getGroupedItemsForTable();
  const rowsHtml = rows.map((data) => {
    const qualDisplay = (data.qualidade === 'N/A' || !data.qualidade) ? '-' : data.qualidade;
    const badgeStyle = qualDisplay !== '-' 
      ? (data.qualidade === 'BG' ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;'
        : data.qualidade === 'SG' ? 'background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe;'
        : 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;')
      : 'background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;';
      
    return `
    <tr>
      <td style="font-family: monospace; border-bottom: 1px solid #e5e7eb; padding: 6px 10px;">${data.cod}</td>
      <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 10px;">${data.nome || '-'}</td>
      <td style="border-bottom: 1px solid #e5e7eb; padding: 6px 10px;"><span style="${badgeStyle} padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${qualDisplay}</span></td>
      <td style="text-align: right; border-bottom: 1px solid #e5e7eb; padding: 6px 10px;">${data.fardos}</td>
      <td style="text-align: right; color: #2563eb; font-weight: bold; border-bottom: 1px solid #e5e7eb; padding: 6px 10px;">${data.m3.toFixed(3).replace('.', ',')}</td>
    </tr>
    `;
  }).join('') || '<tr><td colspan="5" style="text-align: center; padding: 20px;">Nenhum item encontrado.</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Estoque - Comp. Acabado</title>
        <style>
          @media print {
            @page { size: A4; margin: 5mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.85; padding: 0 !important; }
          }
          body { font-family: 'Segoe UI', 'Inter', system-ui, sans-serif; color: #111827; margin: 0; padding: 15px; line-height: 1.3; }
          
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
          .logo { max-height: 40px; }
          .title-box { text-align: center; flex: 1; }
          .title-box h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px; color: #111; }
          .title-box h2 { margin: 4px 0 0; font-size: 14px; font-weight: 500; color: #555; }
          
          .kpi-row { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
          .kpi-card { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 12px; flex: 1; min-width: 120px; background: #f9fafb; page-break-inside: avoid; }
          .kpi-value { font-size: 18px; font-weight: bold; color: #2563eb; margin-bottom: 2px; }
          .kpi-label { font-size: 10px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
          
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; padding: 8px 10px; background: #f3f4f6; border-bottom: 2px solid #ccc; color: #333; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
          td { border-bottom: 1px solid #e5e7eb; padding: 6px 10px; color: #1f2937; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="/assets/logo-full.png" class="logo" alt="Tableros" onerror="this.style.display='none'">
          <div class="title-box">
            <h1>Relatório de Estoque</h1>
            <h2>Compensado Acabado</h2>
          </div>
          <div style="text-align: right; font-size: 11px; color: #555; line-height: 1.4; min-width: 150px;">
            <div>Local: <strong style="color: #111;">${localFilter || 'Todos os Locais'}</strong></div>
            <div>Busca: <strong style="color: #111;">${searchFilter || 'Nenhuma'}</strong></div>
            <div style="margin-top: 4px;">Data: <strong style="color: #111;">${now}</strong></div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card" style="border-left: 3px solid #2563eb; display: flex; flex-direction: column; justify-content: center;">
            <div class="kpi-label" style="margin-bottom: 4px;">Total Fardos</div>
            <div class="kpi-value">${totalFardos}</div>
          </div>
          <div class="kpi-card" style="border-left: 3px solid #2563eb; display: flex; flex-direction: column; justify-content: center;">
            <div class="kpi-label" style="margin-bottom: 4px;">Volume (m³)</div>
            <div class="kpi-value">${totalM3.toFixed(3).replace('.', ',')}</div>
          </div>
          ${qualCardsHtml}
        </div>

        <table>
          <thead>
            <tr>
              <th>Cód. Item</th>
              <th>Descrição</th>
              <th>Qualidade</th>
              <th style="text-align: right;">Caixas</th>
              <th style="text-align: right;">Volume (m³)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <script>
          window.onload = () => { setTimeout(() => { window.print(); }, 500); }
        </script>
      </body>
    </html>
  `;
  
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
