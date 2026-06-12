import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { hasModuleAccess } from '../utils/permissions.js';
import { supabase } from '../config/supabase.js';
import { getBPLID } from '../auth/auth.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { renderTransferenciaInternaTab, bindTransferenciaEvents } from './expedicao-transferencia.js';
import { renderMercadoInternoTab, bindMercadoInternoEvents } from './expedicao-mercado-interno.js';
import { printRomaneioReport } from '../components/romaneio-report.js';

// State
let activeMainTab = sessionStorage.getItem('expedicaoActiveMainTab') || 'ordem_carregamento'; // 'dashboard', 'ordem_carregamento'
let activeSubTab = sessionStorage.getItem('expedicaoActiveSubTab') || 'remessa_armazem'; // 'remessa_armazem'

let remessasCache = [];
export let transferenciasCache = [];
export let mercadoInternoCache = [];
let remessasStatusFilter = 'Todas';
let transferenciasStatusFilter = 'Todas';
let mercadoInternoStatusFilter = 'Todas';

export function getTransferenciasStatusFilter() { return transferenciasStatusFilter; }
export function setTransferenciasStatusFilter(val) { transferenciasStatusFilter = val; }

export function getMercadoInternoStatusFilter() { return mercadoInternoStatusFilter; }
export function setMercadoInternoStatusFilter(val) { mercadoInternoStatusFilter = val; }

// Data caches for the form
let pedidosCache = [];
let sapItemsCache = []; // Will be used to resolve items later
export let empresasCache = [];
export let placasCache = [];
export let reboquesCache = [];
export let motoristasCache = [];

/**
 * Render Expedição page
 */
function initMultiSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  select.style.display = 'none';
  
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-multiselect-wrapper';
  wrapper.style.position = 'relative';
  
  const display = document.createElement('div');
  display.className = 'form-input custom-multiselect-display';
  display.style.minHeight = '38px';
  display.style.cursor = 'pointer';
  display.style.display = 'flex';
  display.style.flexWrap = 'wrap';
  display.style.gap = '4px';
  display.style.alignItems = 'center';
  display.style.padding = '4px 8px';
  
  const placeholder = document.createElement('span');
  placeholder.style.color = 'var(--color-text-secondary)';
  placeholder.textContent = 'Selecione...';
  display.appendChild(placeholder);
  
  const dropdown = document.createElement('div');
  dropdown.className = 'custom-multiselect-dropdown';
  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.left = '0';
  dropdown.style.right = '0';
  dropdown.style.background = 'var(--color-surface)';
  dropdown.style.border = '1px solid var(--color-border)';
  dropdown.style.borderRadius = 'var(--radius-md)';
  dropdown.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
  dropdown.style.maxHeight = '200px';
  dropdown.style.overflowY = 'auto';
  dropdown.style.zIndex = '1000';
  dropdown.style.display = 'none';
  dropdown.style.padding = 'var(--space-2)';
  
  wrapper.appendChild(display);
  wrapper.appendChild(dropdown);
  select.parentNode.insertBefore(wrapper, select);
  
  function updateDisplay() {
    display.innerHTML = '';
    const selectedOptions = Array.from(select.options).filter(o => o.selected);
    if (selectedOptions.length === 0) {
      display.appendChild(placeholder);
    } else {
      selectedOptions.forEach(opt => {
        const tag = document.createElement('span');
        tag.style.background = 'var(--color-primary-light, #e8f5e9)';
        tag.style.color = 'var(--color-primary, #569650)';
        tag.style.padding = '2px 8px';
        tag.style.borderRadius = '12px';
        tag.style.fontSize = '12px';
        tag.style.display = 'inline-flex';
        tag.style.alignItems = 'center';
        tag.style.gap = '4px';
        tag.textContent = opt.text;
        
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          opt.selected = false;
          updateDisplay();
          renderDropdown();
        };
        tag.appendChild(closeBtn);
        display.appendChild(tag);
      });
    }
  }
  
  function renderDropdown() {
    dropdown.innerHTML = '';
    Array.from(select.options).forEach(opt => {
      if(opt.value === '') return;
      const item = document.createElement('div');
      item.style.padding = '6px 8px';
      item.style.cursor = 'pointer';
      item.style.borderRadius = '4px';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.fontSize = '13px';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = opt.selected;
      checkbox.style.pointerEvents = 'none';
      
      item.appendChild(checkbox);
      item.appendChild(document.createTextNode(opt.text));
      
      item.onclick = (e) => {
        e.stopPropagation();
        opt.selected = !opt.selected;
        updateDisplay();
        renderDropdown();
      };
      
      dropdown.appendChild(item);
    });
  }
  
  display.onclick = () => {
    const isVisible = dropdown.style.display === 'block';
    document.querySelectorAll('.custom-multiselect-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) renderDropdown();
  };
  
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  updateDisplay();
  
  // Expose update method to be called when options change
  select.updateCustomMultiSelect = () => {
    updateDisplay();
    renderDropdown();
  };
}

export async function renderExpedicao(container = document.getElementById('view-expedicao') || document.getElementById('app')) {
  const app = container;

  const canCreate = hasModuleAccess('expedicao', 'can_create');
  const canEdit = hasModuleAccess('expedicao', 'can_edit');
  const canDelete = hasModuleAccess('expedicao', 'can_delete');

  if (activeMainTab === 'ordem_carregamento') {
    await fetchRemessas();
  }

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Expedição & Despacho', 'Módulos')}
        <div class="page-content" style="padding-top: var(--space-4);">
          
          <!-- Primary Level 1 Navigation Tabs -->
          <div class="expedicao-primary-tabs" style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: 0;">
            <button class="expedicao-main-tab-btn ${activeMainTab === 'ordem_carregamento' ? 'active' : ''}" data-tab="ordem_carregamento" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'ordem_carregamento' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'ordem_carregamento' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'ordem_carregamento' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'ordem_carregamento' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Ordem de Carregamento
            </button>
          </div>

          <!-- Secondary Navigation Tabs -->
          ${activeMainTab === 'ordem_carregamento' ? `
            <div class="expedicao-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              <button class="expedicao-sub-tab-btn ${activeSubTab === 'remessa_armazem' ? 'active' : ''}" data-subtab="remessa_armazem" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'remessa_armazem' ? '600' : '400'}; color: ${activeSubTab === 'remessa_armazem' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'remessa_armazem' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Remessa para Armazém
              </button>
              <button class="expedicao-sub-tab-btn ${activeSubTab === 'transferencia_interna' ? 'active' : ''}" data-subtab="transferencia_interna" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'transferencia_interna' ? '600' : '400'}; color: ${activeSubTab === 'transferencia_interna' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'transferencia_interna' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Transf. Interna
              </button>
              <button class="expedicao-sub-tab-btn ${activeSubTab === 'mercado_interno' ? 'active' : ''}" data-subtab="mercado_interno" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'mercado_interno' ? '600' : '400'}; color: ${activeSubTab === 'mercado_interno' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'mercado_interno' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Mercado Interno
              </button>
            </div>
          ` : ''}

          <!-- Tab Content -->
          <div id="expedicao-tab-content">
            ${activeMainTab === 'ordem_carregamento' && activeSubTab === 'remessa_armazem' ? renderRemessaArmazemTab(canCreate, canEdit, canDelete) : ''}
            ${activeMainTab === 'ordem_carregamento' && activeSubTab === 'transferencia_interna' ? renderTransferenciaInternaTab(canCreate, canEdit, canDelete) : ''}
            ${activeMainTab === 'ordem_carregamento' && activeSubTab === 'mercado_interno' ? renderMercadoInternoTab(canCreate, canEdit, canDelete) : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindExpedicaoEvents();
}

function bindExpedicaoEvents() {
  // Main tabs
  document.querySelectorAll('.expedicao-main-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.dataset.tab;
      if (targetTab !== activeMainTab) {
        activeMainTab = targetTab;
        if (activeMainTab === 'ordem_carregamento') activeSubTab = 'remessa_armazem';
        sessionStorage.setItem('expedicaoActiveMainTab', activeMainTab);
        sessionStorage.setItem('expedicaoActiveSubTab', activeSubTab);
        renderExpedicao();
      }
    });
  });

  // Sub tabs
  document.querySelectorAll('.expedicao-sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetSubTab = e.currentTarget.dataset.subtab;
      if (targetSubTab !== activeSubTab) {
        activeSubTab = targetSubTab;
        sessionStorage.setItem('expedicaoActiveSubTab', activeSubTab);
        renderExpedicao();
      }
    });
  });

  // Toolbar events for Remessa
  const btnNewRemessa = document.getElementById('btn-new-remessa');
  if (btnNewRemessa) {
    btnNewRemessa.addEventListener('click', () => {
      showRemessaModal();
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-expedicao');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = 'Atualizando...';
      pedidosCache = [];
      sapItemsCache = [];
      empresasCache = [];
      placasCache = [];
      reboquesCache = [];
      motoristasCache = [];
      if (activeMainTab === 'ordem_carregamento') {
        await fetchRemessas();
      }
      renderExpedicao();
      showToast('Dados atualizados com sucesso!', 'success');
    });
  }
  
  // Bind new events from Transferencia Interna tab
  bindTransferenciaEvents();
  bindMercadoInternoEvents();

  const filterRemessa = document.getElementById('remessa-status-filter');
  if (filterRemessa) {
    filterRemessa.addEventListener('change', async (e) => {
      remessasStatusFilter = e.target.value;
      await fetchRemessas();
      renderExpedicao();
    });
  }

  // Table Row Events
  document.querySelectorAll('.btn-view-remessa').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      printRomaneioReport(id);
    });
  });

  document.querySelectorAll('.btn-edit-remessa').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showRemessaModal(id);
    });
  });

  document.querySelectorAll('.btn-delete-remessa').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const oc = remessasCache.find(r => r.id == id);
      if (!oc) return;
      
      // Validação: "excluir só pode ser feito enquanto ainda não tiverem pacotes bipados, ou já finalizada"
      if (oc.status !== 'Concluída' && oc.status !== 'Finalizada') {
        const { data: romaneios } = await supabase
          .from('expedicao_romaneios')
          .select('id')
          .eq('ordem_carregamento_id', id);
          
        if (romaneios && romaneios.length > 0) {
          const { count, error } = await supabase
            .from('expedicao_romaneio_itens')
            .select('*', { count: 'exact', head: true })
            .in('romaneio_id', romaneios.map(r => r.id));
            
          if (count && count > 0) {
            showToast('Bloqueado: OC já possui pacotes bipados e ainda não foi finalizada.', 'error');
            return;
          }
        }
      }
      
      if (confirm(`Tem certeza que deseja EXCLUIR permanentemente a Ordem de Carregamento ${oc.codigo_oc}?`)) {
        // Excluir os itens vinculados primeiro (caso o banco não tenha cascade)
        await supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', id);
        const { error } = await supabase.from('expedicao_ordens_carregamento').delete().eq('id', id);
        
        if (error) {
          console.error(error);
          showToast('Erro ao excluir a Ordem de Carregamento', 'error');
        } else {
          showToast('OC excluída com sucesso!', 'success');
          await fetchRemessas();
          renderExpedicao();
        }
      }
    });
  });
}

function renderRemessaArmazemTab(canCreate, canEdit, canDelete) {
  let tbody = '';
  
  if (remessasCache.length === 0) {
    tbody = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary); padding: var(--space-6);">Nenhuma Ordem de Carregamento encontrada para o filtro atual.</td></tr>`;
  } else {
    tbody = remessasCache.map(r => `
      <tr>
        <td style="font-weight: 500;">${r.codigo_oc || '-'}</td>
        <td>${new Date(r.previsao_carga).toLocaleString('pt-BR')}</td>
        <td>${r.transportadora || '-'}</td>
        <td>${r.placa || '-'}</td>
        <td>${r.itens_count || 0}</td>
        <td>
          <span class="badge" style="background: ${r.status === 'Ativa' ? 'var(--color-primary-light)' : 'var(--color-surface-alt)'}; color: ${r.status === 'Ativa' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: 1px solid ${r.status === 'Ativa' ? 'var(--color-primary)' : 'var(--color-border)'};">
            ${r.status}
          </span>
        </td>
        <td style="text-align: right;">
          ${r.status === 'Finalizada' ? `
          <button class="btn btn-sm btn-icon btn-view-remessa" data-id="${r.id}" title="Ver / Imprimir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
          ` : ''}
          ${canEdit ? `
          <button class="btn btn-sm btn-icon btn-edit-remessa" data-id="${r.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          ` : ''}
          ${canDelete ? `
          <button class="btn btn-sm btn-icon btn-delete-remessa" data-id="${r.id}" title="Excluir" style="color: var(--color-danger);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  }

  return `
    <!-- Search/Filters toolbar -->
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <select id="remessa-status-filter" class="filter-select" style="font-size: var(--font-size-sm); height: 34px; width: 160px;">
          <option value="Todas" ${remessasStatusFilter === 'Todas' ? 'selected' : ''}>Todas as Remessas</option>
          <option value="Ativa" ${remessasStatusFilter === 'Ativa' ? 'selected' : ''}>Ativas</option>
          <option value="Concluída" ${remessasStatusFilter === 'Concluída' ? 'selected' : ''}>Concluídas</option>
        </select>
      </div>
      <div class="flex" style="gap: 12px; margin-left: auto;">
        <button id="btn-refresh-expedicao" class="btn btn-outline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.13-5.85L7 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 1 0-2.13 5.85L17 16"></path></svg> 
          Atualizar Dados
        </button>
        ${canCreate ? `
        <button id="btn-new-remessa" class="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nova Remessa
        </button>
        ` : ''}
      </div>
    </div>
    
    <div class="card" style="border-color: var(--color-border); background: var(--color-surface); display: flex; flex-direction: column; padding: 0; overflow: hidden;">
      <div class="table-container" style="flex: 1;">
        <table class="table">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs);">OC</th>
              <th style="font-size: var(--font-size-xs);">Previsão</th>
              <th style="font-size: var(--font-size-xs);">Transportadora</th>
              <th style="font-size: var(--font-size-xs);">Placa</th>
              <th style="font-size: var(--font-size-xs);">Qtd Itens</th>
              <th style="font-size: var(--font-size-xs);">Status</th>
              <th style="text-align: right; font-size: var(--font-size-xs);">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function fetchRemessas() {
  const bplid = getBPLID();
  let query = supabase.from('expedicao_ordens_carregamento')
    .select('*, expedicao_ordens_carregamento_itens(*)')
    .eq('bplid', bplid)
    .order('created_at', { ascending: false });
    
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching OCs:', error);
    showToast('Erro ao carregar Ordens de Carregamento', 'error');
  } else {
    // Separa as remessas e transferências na hora de carregar para facilitar as abas
    let remessasData = data.filter(r => !r.tipo || r.tipo === 'remessa_armazem');
    if (remessasStatusFilter !== 'Todas') {
      remessasData = remessasData.filter(r => r.status === remessasStatusFilter);
    }
    remessasCache = remessasData.map(r => ({
      ...r,
      itens_count: r.expedicao_ordens_carregamento_itens ? r.expedicao_ordens_carregamento_itens.length : 0
    }));

    let transfData = data.filter(r => r.tipo === 'transferencia_interna');
    if (transferenciasStatusFilter !== 'Todas') {
      transfData = transfData.filter(r => r.status === transferenciasStatusFilter);
    }
    transferenciasCache = transfData.map(r => ({
      ...r,
      itens_count: r.expedicao_ordens_carregamento_itens ? r.expedicao_ordens_carregamento_itens.length : 0
    }));

    let miData = data.filter(r => r.tipo === 'mercado_interno');
    if (mercadoInternoStatusFilter !== 'Todas') {
      miData = miData.filter(r => r.status === mercadoInternoStatusFilter);
    }
    mercadoInternoCache = miData.map(r => ({
      ...r,
      itens_count: r.expedicao_ordens_carregamento_itens ? r.expedicao_ordens_carregamento_itens.length : 0
    }));
  }
}

async function fetchPedidos() {
  if (pedidosCache.length > 0) return pedidosCache;
  try {
    const url = "/api/SQLQueries('ContratoME')/List";
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true', 'Prefer': 'odata.maxpagesize=0', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    if (res.ok) {
      const data = await res.json();
      // Normalize keys that might have single quotes from SAP
      const normalized = (data.value || []).map(p => {
        let rawName = p.FrgnName || p["'FrgnName'"] || p.ForeignName || p["'ForeignName'"] || p.ItemName || p["'ItemName'"] || p.NomeItem || p["'NomeItem'"] || '';
        return {
        Numero: p.Numero || p["'Numero'"],
        Armazem: p.Armazem || p["'Armazem'"],
        U_cod_pn: p.U_cod_pn || p["'U_cod_pn'"],
        ItemCode: p.ItemCode || p["'ItemCode'"],
        ItemName: rawName,
        QuantidadePlanejada: p.QuantidadePlanejada !== undefined ? p.QuantidadePlanejada : p["'QuantidadePlanejada'"],
        QuantidadeAcumulada: p.QuantidadeAcumulada !== undefined ? p.QuantidadeAcumulada : p["'QuantidadeAcumulada'"],
        U_atv_prod: p.U_atv_prod !== undefined ? p.U_atv_prod : p["'U_atv_prod'"],
        UnitPrice: p.UnitPrice || p["'UnitPrice'"] || p.Price || p["'Price'"] || 0,
        U_UF: p.U_UF || p["'U_UF'"],
        U_cod_mun: p.U_cod_mun || p["'U_cod_mun'"]
      };
      });
      // Filter the ones with U_atv_prod == null or 1
      pedidosCache = normalized.filter(p => p.U_atv_prod == 1);
    }
  } catch(e) { console.error('Error fetching Pedidos', e); }
  return pedidosCache;
}

export async function fetchLogisticaData() {
  if (empresasCache.length === 0) {
    try {
      const url = "/api/BusinessPartners?$select=CardCode,CardName,BPFiscalTaxIDCollection&$filter=Properties1 eq 'tYES'";
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'Prefer': 'odata.maxpagesize=0' } });
      if (res.ok) {
        const data = await res.json();
        const bps = data.value || [];
        const grouped = {};
        for (const bp of bps) {
          const cnpj = bp.BPFiscalTaxIDCollection?.[0]?.TaxId0;
          if (!cnpj) continue;
          if (!grouped[cnpj]) {
            grouped[cnpj] = { cnpj, nome_fantasia: bp.CardName, card_code: bp.CardCode };
          } else if (bp.CardCode && bp.CardCode.startsWith('F')) {
            // Se já existe mas encontramos o de fornecedor (F), sobreecrevemos
            grouped[cnpj].card_code = bp.CardCode;
            grouped[cnpj].nome_fantasia = bp.CardName;
          }
        }
        empresasCache = Object.values(grouped).sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia));
      }
    } catch(e) { console.error('Error fetching Transportadoras', e); }
  }

  if (placasCache.length === 0 || reboquesCache.length === 0 || motoristasCache.length === 0) {
    const bplid = getBPLID();
    try {
      if (placasCache.length === 0) {
        const { data } = await supabase.from('logistica_placas').select('*').eq('bplid', bplid).order('placa');
        placasCache = data || [];
      }
      if (reboquesCache.length === 0) {
        const { data } = await supabase.from('logistica_reboques').select('*').eq('bplid', bplid).order('placa');
        reboquesCache = data || [];
      }
      if (motoristasCache.length === 0) {
        const { data } = await supabase.from('logistica_motoristas').select('*').eq('bplid', bplid).order('nome');
        motoristasCache = data || [];
      }
    } catch(e) { console.error('Error fetching Supabase Logistics', e); }
  }
}

function showRemessaModal(editId = null) {
  const isEdit = !!editId;
  const remessa = editId ? remessasCache.find(r => r.id == editId) : null;
  const bplid = getBPLID();
  const isPal = bplid == 1; // Assuming 1 is PAL
  
  const ufs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const ufOptions = '<option value="">Selecione...</option>' + ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('');
  
  // Create a modal container
  let modalContainer = document.getElementById('remessa-modal-container');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'remessa-modal-container';
    document.body.appendChild(modalContainer);
  }
  
  modalContainer.innerHTML = `
    <div class="modal-backdrop" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
      <div class="modal-content" style="background: var(--color-surface); width: 95%; max-width: 1200px; height: 90vh; border-radius: var(--radius-lg); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
        
        <!-- Header -->
        <div style="padding: var(--space-4); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: var(--font-size-xl); font-weight: 600;">${isEdit ? 'Editar Ordem de Carregamento' : 'Nova Ordem de Carregamento'}</h2>
          <button type="button" class="btn btn-icon" onclick="document.getElementById('remessa-modal-container').innerHTML = ''">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <!-- Body -->
        <div style="flex: 1; overflow-y: auto; padding: var(--space-4);">
          <form id="remessa-form" style="position: relative;">
            
            <div id="rm-loading-overlay" style="display: none; position: absolute; top: -20px; left: -20px; right: -20px; bottom: -20px; background: rgba(255,255,255,0.85); z-index: 100; flex-direction: column; justify-content: flex-start; align-items: center; padding-top: 150px; border-radius: var(--radius-lg); backdrop-filter: blur(2px);">
              <div class="spinner" style="width: 40px; height: 40px; border-width: 4px; border-color: var(--color-primary); border-right-color: transparent; margin-bottom: var(--space-4);"></div>
              <span style="color: var(--color-text); font-weight: 600; font-size: 1.1rem;">Sincronizando com o SAP...</span>
              <span style="color: var(--color-text-secondary); font-size: 0.9rem; margin-top: 4px;">Isso pode levar alguns segundos.</span>
            </div>

            <!-- Header Fields -->
            <div style="background: var(--color-surface-alt); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-6); border: 1px solid var(--color-border-light);">
              <h3 style="font-size: var(--font-size-base); margin-bottom: var(--space-4); color: var(--color-text);">Dados Gerais (Cabeçalho)</h3>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4);">
                
                <div class="form-group">
                  <label class="form-label">Previsão de Carga <span style="color: var(--color-danger);">*</span></label>
                  <input type="datetime-local" class="form-input" id="rm-previsao" max="9999-12-31T23:59" required>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Peso Máximo (kg)</label>
                  <input type="number" step="0.01" class="form-input" id="rm-peso-max">
                </div>

                <div class="form-group">
                  <label class="form-label">Quantidade Mínima (m³)</label>
                  <input type="number" step="0.01" class="form-input" id="rm-qtd-min">
                </div>



                <div class="form-group">
                  <label class="form-label">Transportadora</label>
                  <select class="form-select" id="rm-transportadora">
                    <option value="">Selecione...</option>
                    ${empresasCache.map(e => `<option value="${e.nome_fantasia}" data-cnpj="${e.cnpj}" data-cod="${e.card_code}">${e.nome_fantasia} (${e.cnpj})</option>`).join('')}
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Motorista</label>
                  <select class="form-select" id="rm-motorista">
                    <option value="">Selecione...</option>
                    ${motoristasCache.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('')}
                  </select>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Placa (Tração)</label>
                  <select class="form-select" id="rm-placa">
                    <option value="">Selecione...</option>
                    ${placasCache.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('')}
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Placas dos Reboques</label>
                  <select class="form-select" id="rm-reboques" multiple>
                    ${reboquesCache.map(r => `<option value="${r.placa}">${r.placa}</option>`).join('')}
                  </select>
                </div>
                
                ${isPal ? `
                <div class="form-group">
                  <label class="form-label">UF Carregamento <span style="color: var(--color-danger);">*</span></label>
                  <select class="form-select" id="rm-uf-carregamento" required>
                    ${ufs.map(uf => `<option value="${uf}" ${uf === 'PR' ? 'selected' : ''}>${uf}</option>`).join('')}
                  </select>
                </div>
                
                <div class="form-group">
                  <label class="form-label">UF Descarregamento <span style="color: var(--color-danger);">*</span></label>
                  <select class="form-select" id="rm-uf-descarregamento" required>
                    ${ufOptions}
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">UFs de Percurso</label>
                  <select class="form-select" id="rm-ufs-percurso" multiple>
                    ${ufs.map(uf => `<option value="${uf}">${uf}</option>`).join('')}
                  </select>
                </div>
                ` : ''}

                <div class="form-group" style="display: flex; align-items: flex-end; padding-bottom: 8px; grid-column: 1 / -1; margin-top: var(--space-2);">
                  <label class="form-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-md);">
                    <input type="checkbox" id="rm-liberado" style="width: 20px; height: 20px; accent-color: var(--color-success);" />
                    <span style="font-weight: 600; color: #166534;">Liberar para Carregamento</span>
                  </label>
                </div>

              </div>
            </div>

            <!-- Items Table -->
            <div style="margin-bottom: var(--space-4); display: flex; justify-content: space-between; align-items: center;">
              <h3 style="font-size: var(--font-size-base); color: var(--color-text);">Itens da Remessa</h3>
              <button type="button" class="btn btn-sm btn-secondary" id="btn-add-rm-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Adicionar Item
              </button>
            </div>

            <div class="table-container" style="border: 1px solid var(--color-border-light); border-radius: var(--radius-md); overflow: hidden;">
              <table class="table" id="rm-items-table">
                <thead style="background: var(--color-surface-alt);">
                  <tr>
                    <th style="font-size: 11px; width: 25%;">Origem</th>
                    <th style="font-size: 11px; width: 45%;">Produto & Pendência</th>
                    <th style="font-size: 11px; width: 25%;">Programação</th>
                    <th style="width: 5%;"></th>
                  </tr>
                </thead>
                <tbody id="rm-items-tbody">
                  <!-- JS will inject rows here -->
                </tbody>
              </table>
            </div>
            <div id="rm-empty-state" style="text-align: center; padding: var(--space-6); color: var(--color-text-secondary); border: 1px dashed var(--color-border); border-radius: var(--radius-md); margin-top: var(--space-2);">
              Nenhum item adicionado à remessa ainda.
            </div>

          </form>
        </div>
        
        <!-- Footer -->
        <div style="padding: var(--space-4); border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: var(--space-3); background: var(--color-surface-alt);">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('remessa-modal-container').innerHTML = ''">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-save-remessa" style="display: none;">Salvar Remessa</button>
        </div>

      </div>
    </div>
  `;
  
  // Load SAP Data and Initialize form
  initRemessaForm(isEdit, remessa);
}

async function initRemessaForm(isEdit, remessa) {
  const overlay = document.getElementById('rm-loading-overlay');
  const form = document.getElementById('remessa-form');
  const btnSave = document.getElementById('btn-save-remessa');
  
  overlay.style.display = 'flex';
  
  // Fetch from SAP and Supabase
  await Promise.all([
    fetchPedidos(),
    fetchLogisticaData()
  ]);
  
  // Now that caches are populated, we can show the modal
  // Note: the modal HTML needs to be re-rendered or options appended because 
  // showRemessaModal generates the HTML before caches are loaded.
  // We should update the selects here.
  const selectTransp = document.getElementById('rm-transportadora');
  if (selectTransp.options.length <= 1) {
    selectTransp.innerHTML = '<option value="">Selecione...</option>' + 
      empresasCache.map(e => `<option value="${e.nome_fantasia}" data-cnpj="${e.cnpj}" data-cod="${e.card_code}">${e.nome_fantasia} (${e.cnpj})</option>`).join('');
  }
  
  const selectPlaca = document.getElementById('rm-placa');
  if (selectPlaca.options.length <= 1) {
    selectPlaca.innerHTML = '<option value="">Selecione...</option>' + 
      placasCache.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
  }

  const selectMotorista = document.getElementById('rm-motorista');
  if (selectMotorista.options.length <= 1) {
    selectMotorista.innerHTML = '<option value="">Selecione...</option>' + 
      motoristasCache.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  }
  
  const selectReboque = document.getElementById('rm-reboques');
  if (selectReboque.options.length === 0) {
    selectReboque.innerHTML = reboquesCache.map(r => `<option value="${r.placa}">${r.placa}</option>`).join('');
  }
  
  // Clean up any existing wrapper so we don't duplicate when reopening modal
  const existingReboqueWrapper = selectReboque.nextElementSibling;
  if (existingReboqueWrapper && existingReboqueWrapper.classList.contains('custom-multiselect-wrapper')) {
    existingReboqueWrapper.remove();
    selectReboque.style.display = '';
  }
  
  initMultiSelect('rm-reboques');
  
  const selectUfPercurso = document.getElementById('rm-ufs-percurso');
  if (selectUfPercurso) {
    const existingUfWrapper = selectUfPercurso.nextElementSibling;
    if (existingUfWrapper && existingUfWrapper.classList.contains('custom-multiselect-wrapper')) {
      existingUfWrapper.remove();
      selectUfPercurso.style.display = '';
    }
    initMultiSelect('rm-ufs-percurso');
  }

  // Dependent field logic
  selectTransp.addEventListener('change', (e) => {
    const selectedOption = e.target.selectedOptions[0];
    const cnpj = selectedOption ? selectedOption.dataset.cnpj : null;
    
    // Filter Placa
    let filteredPlacas = placasCache;
    if (cnpj) {
      filteredPlacas = placasCache.filter(p => p.empresa_cnpj === cnpj);
    }
    selectPlaca.innerHTML = '<option value="">Selecione...</option>' + 
      filteredPlacas.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
      
    // Filter Motorista
    let filteredMotoristas = motoristasCache;
    if (cnpj) {
      filteredMotoristas = motoristasCache.filter(m => m.empresa_cnpj === cnpj);
    }
    selectMotorista.innerHTML = '<option value="">Selecione...</option>' + 
      filteredMotoristas.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
      
    // Filter Reboques
    let filteredReboques = reboquesCache;
    if (cnpj) {
      filteredReboques = reboquesCache.filter(r => r.empresa_cnpj === cnpj);
    }
    selectReboque.innerHTML = filteredReboques.map(r => `<option value="${r.placa}">${r.placa}</option>`).join('');
    
    // Refresh the custom multiselect UI for reboques
    const wrapper = selectReboque.nextElementSibling;
    if (wrapper && wrapper.classList.contains('custom-multiselect-wrapper')) {
      wrapper.remove();
      selectReboque.style.display = '';
      initMultiSelect('rm-reboques');
    }
  });
  
  // Validation for Liberar checkbox
  const cbLiberado = document.getElementById('rm-liberado');
  cbLiberado.addEventListener('click', (e) => {
    if (e.target.checked) {
      const motoristaVal = selectMotorista.value;
      const placaVal = selectPlaca.value;
      if (!motoristaVal || !placaVal) {
        e.preventDefault();
        showToast('Para liberar a carga, você precisa preencher o Motorista e a Placa (Tração).', 'warning');
      }
    }
  });
  
  overlay.style.display = 'none';
  form.style.display = 'block';
  btnSave.style.display = 'block';
  
  // Bind Save Button
  btnSave.addEventListener('click', async () => {
    const editId = isEdit && remessa ? remessa.id : null;
    await saveRemessa(isEdit, editId);
  });
  
  // Initialize Add Item button
  document.getElementById('btn-add-rm-item').addEventListener('click', () => {
    addRemessaItemRow();
  });
  
  if (!isEdit) {
    addRemessaItemRow(); // start with one empty row
  } else {
    // Populate form with existing remessa data
    if (remessa.previsao_carga) {
      // Ajuste de timezone para exibir corretamente no datetime-local
      const date = new Date(remessa.previsao_carga);
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
      document.getElementById('rm-previsao').value = localISOTime;
    }
    
    document.getElementById('rm-peso-max').value = remessa.peso_maximo || '';
    document.getElementById('rm-qtd-min').value = remessa.quantidade_minima || '';
    
    // Set transportadora, trigger change to filter placa/motorista
    const selectTransp = document.getElementById('rm-transportadora');
    selectTransp.value = remessa.transportadora || '';
    selectTransp.dispatchEvent(new Event('change'));
    
    document.getElementById('rm-placa').value = remessa.placa || '';
    document.getElementById('rm-motorista').value = remessa.motorista || '';
    document.getElementById('rm-liberado').checked = remessa.liberado_carregamento || false;
    
    const bplid = getBPLID();
    if (bplid == 1) {
      document.getElementById('rm-uf-carregamento').value = remessa.uf_carregamento || '';
      document.getElementById('rm-uf-descarregamento').value = remessa.uf_descarregamento || '';
      
      const selectUfsPercurso = document.getElementById('rm-ufs-percurso');
      if (selectUfsPercurso && remessa.ufs_percurso) {
        const ufArr = remessa.ufs_percurso.split(',');
        Array.from(selectUfsPercurso.options).forEach(opt => {
          opt.selected = ufArr.includes(opt.value);
        });
        
        const existingUfWrapper = selectUfsPercurso.nextElementSibling;
        if (existingUfWrapper && existingUfWrapper.classList.contains('custom-multiselect-wrapper')) {
          existingUfWrapper.remove();
          selectUfsPercurso.style.display = '';
        }
        initMultiSelect('rm-ufs-percurso');
      }
    }
    
    // Multi-select for reboques
    const selectReboqueEl = document.getElementById('rm-reboques');
    if (selectReboqueEl && remessa.reboques) {
      const rebArr = remessa.reboques.split(',');
      Array.from(selectReboqueEl.options).forEach(opt => {
        opt.selected = rebArr.includes(opt.value);
      });
      
      const wrapper = selectReboqueEl.nextElementSibling;
      if (wrapper && wrapper.classList.contains('custom-multiselect-wrapper')) {
        wrapper.remove();
        selectReboqueEl.style.display = '';
      }
      initMultiSelect('rm-reboques');
    }

    // Populate items
    if (remessa.expedicao_ordens_carregamento_itens && remessa.expedicao_ordens_carregamento_itens.length > 0) {
      remessa.expedicao_ordens_carregamento_itens.forEach(item => {
        const tr = addRemessaItemRow();
        tr.querySelector('.rm-item-db-id').value = item.id;
        
        const selectPedido = tr.querySelector('.rm-pedido-select');
        selectPedido.value = item.pedido_numero;
        selectPedido.dispatchEvent(new Event('change'));
        
        const selectItem = tr.querySelector('.rm-item-select');
        // Because value now includes __index, we need to find the option that matches the real item code
        // For backwards compatibility with saved data, we find by data-realcode
        setTimeout(() => {
          const options = Array.from(selectItem.options);
          const match = options.find(o => o.dataset.realcode === item.item_code);
          if (match) {
            selectItem.value = match.value;
            selectItem.dispatchEvent(new Event('change'));
          } else {
            selectItem.value = item.item_code; // fallback
            selectItem.dispatchEvent(new Event('change'));
          }
        }, 100);
        
        
        const selectTipo = tr.querySelector('.rm-tipo-select');
        selectTipo.value = item.tipo;
        selectTipo.dispatchEvent(new Event('change'));
        
        const inputQtdProg = tr.querySelector('.rm-qtd-prog');
        inputQtdProg.value = item.quantidade_programada;
      });
    } else {
      addRemessaItemRow();
    }
  }
}

function addRemessaItemRow() {
  const tbody = document.getElementById('rm-items-tbody');
  const emptyState = document.getElementById('rm-empty-state');
  
  emptyState.style.display = 'none';
  
  const tr = document.createElement('tr');
  const uniqueId = 'item_' + Math.random().toString(36).substr(2, 9);
  tr.id = uniqueId;
  
  // Options for Pedido (Deduplicados)
  const uniquePedidos = [...new Set(pedidosCache.map(p => p.Numero))];
  const pedidoOptions = `<option value="">Selecione...</option>` + 
    uniquePedidos.map(num => `<option value="${num}">${num}</option>`).join('');

  tr.innerHTML = `
    <td style="vertical-align: top;">
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        <input type="hidden" class="rm-item-db-id" />
        <select class="form-select rm-pedido-select" style="width: 100%;" required>
          ${pedidoOptions}
        </select>
        <input type="text" class="form-input rm-destino" readonly placeholder="Destino" style="width: 100%; background: var(--color-surface-alt); font-size: 11px;" />
        <input type="hidden" class="rm-armazem" />
        <input type="hidden" class="rm-cod-pn" />
      </div>
    </td>
    <td style="vertical-align: top;">
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        <select class="form-select rm-item-select" style="width: 100%;" required disabled>
          <option value="">Selecione um pedido primeiro...</option>
        </select>
        <div style="display: flex; gap: var(--space-2); align-items: center;">
          <span style="font-size: 11px; color: var(--color-text-secondary); white-space: nowrap;">Qtd Pendente:</span>
          <input type="number" class="form-input rm-qtd-pendente" readonly style="width: 100px; background: var(--color-surface-alt);" />
          <small class="rm-qtd-info" style="font-size: 10px; color: var(--color-text-secondary);"></small>
        </div>
      </div>
    </td>
    <td style="vertical-align: top;">
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        <select class="form-select rm-tipo-select" style="width: 100%;" required>
          <option value="Obrigatório">Obrigatório</option>
          <option value="Complementar">Complementar</option>
        </select>
        <input type="number" step="0.01" class="form-input rm-qtd-prog" placeholder="Qtd a Programar" style="width: 100%;" required />
      </div>
    </td>
    <td style="text-align: center; vertical-align: middle;">
      <button type="button" class="btn btn-sm btn-icon btn-remove-row" style="color: var(--color-danger);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </td>
  `;
  
  tbody.appendChild(tr);
  
  // Bind events for this specific row
  bindRemessaRowEvents(tr);
  
  return tr;
}

function bindRemessaRowEvents(tr) {
  const btnRemove = tr.querySelector('.btn-remove-row');
  btnRemove.addEventListener('click', () => {
    tr.remove();
    const tbody = document.getElementById('rm-items-tbody');
    if (tbody.children.length === 0) {
      document.getElementById('rm-empty-state').style.display = 'block';
    }
  });

  const selectPedido = tr.querySelector('.rm-pedido-select');
  const inputDestino = tr.querySelector('.rm-destino');
  const inputArmazem = tr.querySelector('.rm-armazem');
  const inputCodPn = tr.querySelector('.rm-cod-pn');
  const selectItem = tr.querySelector('.rm-item-select');
  
  const selectTipo = tr.querySelector('.rm-tipo-select');
  const inputQtdProg = tr.querySelector('.rm-qtd-prog');
  const inputQtdPendente = tr.querySelector('.rm-qtd-pendente');
  
  selectPedido.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) {
      inputDestino.value = '';
      selectItem.innerHTML = '<option value="">Selecione um pedido primeiro...</option>';
      selectItem.disabled = true;
      return;
    }
    
    // Find the Pedido
    const pedido = pedidosCache.find(p => p.Numero === val);
    if (pedido) {
      // Destino text: Armazem - U_cod_pn
      inputDestino.value = `${pedido.Armazem || ''} - ${pedido.U_cod_pn || ''}`;
      inputArmazem.value = pedido.Armazem || '';
      inputCodPn.value = pedido.U_cod_pn || '';
      
      // Populate Items select (for now mock it from the pedido object if it exists, or just show a mocked item)
      // Wait: The SAP CONTRATOME returns item details at the row level? Usually, if Numero is the same, 
      // the view might have multiple rows for the same Numero but different ItemCode.
      // So we filter all rows in pedidosCache that have this 'Numero' to build the items list.
      const pedidoItems = pedidosCache.filter(p => p.Numero === val);
      
      let itemOptions = '<option value="">Selecione o Item...</option>';
      pedidoItems.forEach((pi, index) => {
        itemOptions += `<option value="${pi.ItemCode}__${index}" data-realcode="${pi.ItemCode}" data-name="${pi.ItemName}" data-planejada="${pi.QuantidadePlanejada || 0}" data-acumulada="${pi.QuantidadeAcumulada || 0}" data-price="${pi.UnitPrice || 0}" data-uf="${pi.U_UF || ''}" data-codmun="${pi.U_cod_mun || ''}">${pi.ItemCode} - ${pi.ItemName}</option>`;
      });
      
      selectItem.innerHTML = itemOptions;
      selectItem.disabled = false;
    }
  });
  
  selectItem.addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    if (option && option.value) {
      const plan = parseFloat(option.dataset.planejada) || 0;
      const acum = parseFloat(option.dataset.acumulada) || 0;
      const pendente = plan - acum;
      
      inputQtdPendente.value = pendente > 0 ? pendente : 0;
      tr.querySelector('.rm-qtd-info').innerText = `Plan: ${plan} | Acum: ${acum}`;
      
      // Reset prog
      if (selectTipo.value === 'Obrigatório') {
        inputQtdProg.max = pendente > 0 ? pendente : 0;
      }
    } else {
      inputQtdPendente.value = '';
      tr.querySelector('.rm-qtd-info').innerText = '';
    }
  });
  
  selectTipo.addEventListener('change', (e) => {
    const tipo = e.target.value;
    if (tipo === 'Complementar') {
      inputQtdProg.value = '';
      inputQtdProg.disabled = true;
      inputQtdProg.required = false;
    } else {
      inputQtdProg.disabled = false;
      inputQtdProg.required = true;
    }
  });
  
  inputQtdProg.addEventListener('input', (e) => {
    const prog = parseFloat(e.target.value) || 0;
    const pendente = parseFloat(inputQtdPendente.value) || 0;
    
    if (selectTipo.value === 'Obrigatório') {
      if (prog > pendente) {
        showToast('Quantidade programada não pode exceder a pendente!', 'error');
        e.target.value = pendente;
      }
    }
  });
}

async function saveRemessa(isEdit, editId) {
  const previsao = document.getElementById('rm-previsao').value;
  if (!previsao) {
    showToast('A Previsão de Carga é obrigatória.', 'error');
    return;
  }
  
  const pesoMax = document.getElementById('rm-peso-max').value;
  const qtdMin = document.getElementById('rm-qtd-min').value;
  const transpSelect = document.getElementById('rm-transportadora');
  const transportadora = transpSelect.value;
  const transportadoraCod = transpSelect.selectedOptions[0]?.dataset?.cod || null;
  const placa = document.getElementById('rm-placa').value;
  const reboquesSelect = document.getElementById('rm-reboques');
  const reboques = Array.from(reboquesSelect.selectedOptions).map(o => o.value).join(',');
  
  let ufCarregamento = null, ufDescarregamento = null, ufsPercurso = null;
  const bplid = getBPLID();
  if (bplid == 1) {
    ufCarregamento = document.getElementById('rm-uf-carregamento')?.value;
    ufDescarregamento = document.getElementById('rm-uf-descarregamento')?.value;
    const ufsPercursoSelect = document.getElementById('rm-ufs-percurso');
    if (ufsPercursoSelect) {
      ufsPercurso = Array.from(ufsPercursoSelect.selectedOptions).map(o => o.value).join(',');
    }
    
    if (!ufCarregamento || !ufDescarregamento) {
      showToast('UF de Carregamento e Descarregamento são obrigatórios para a rota MDF-e.', 'error');
      return;
    }
  }
  
  const tbody = document.getElementById('rm-items-tbody');
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) {
    showToast('Adicione pelo menos um item à remessa.', 'error');
    return;
  }
  
  const itens = [];
  for (const tr of rows) {
    const pedido = tr.querySelector('.rm-pedido-select').value;
    const destino = tr.querySelector('.rm-destino').value;
    const armazem = tr.querySelector('.rm-armazem').value;
    const codPn = tr.querySelector('.rm-cod-pn').value;
    
    const selectItem = tr.querySelector('.rm-item-select');
    const itemOption = selectItem.selectedOptions[0];
    const itemCodeCombo = selectItem.value; // e.g. "ACB0692__0"
    const itemCode = itemCodeCombo ? itemCodeCombo.split('__')[0] : '';
    const itemName = itemOption ? itemOption.dataset.name : '';
    const unitPrice = itemOption ? parseFloat(itemOption.dataset.price) || 0 : 0;
    const uf = itemOption ? itemOption.dataset.uf : '';
    const codMun = itemOption ? itemOption.dataset.codmun : '';
    
    const tipo = tr.querySelector('.rm-tipo-select').value;
    const qtdProg = tr.querySelector('.rm-qtd-prog').value;
    const dbId = tr.querySelector('.rm-item-db-id')?.value;
    
    if (!pedido || !itemCode) {
      showToast('Preencha os campos obrigatórios (Pedido e Item) em todas as linhas.', 'error');
      return;
    }
    
    if (tipo === 'Obrigatório' && !qtdProg) {
      showToast('A Quantidade a Programar é obrigatória nos itens do tipo Obrigatório.', 'error');
      return;
    }
    
    const newItem = {
      pedido_numero: pedido,
      armazem: armazem,
      cod_pn: codPn,
      item_code: itemCode,
      item_name: itemName,
      tipo: tipo,
      // Replace comma with dot before parsing if needed
      quantidade_programada: tipo === 'Obrigatório' ? (parseFloat(qtdProg.replace(',', '.')) || 0) : null,
      unit_price: unitPrice,
      u_uf: uf,
      u_cod_mun: codMun
    };
    if (dbId) newItem.id = dbId;
    itens.push(newItem);
  }
  
  try {
    document.getElementById('rm-loading-overlay').style.display = 'flex';
    document.getElementById('rm-loading-overlay').innerHTML = `
      <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; border-color: var(--color-primary); border-right-color: transparent;"></div>
      <span style="margin-left: var(--space-3);">Salvando Ordem de Carregamento...</span>
    `;
    
    const headerData = {
      bplid: getBPLID(),
      previsao_carga: new Date(previsao).toISOString(),
      peso_maximo: pesoMax ? parseFloat(pesoMax) : null,
      quantidade_minima: qtdMin ? parseFloat(qtdMin) : null,
      liberado_carregamento: document.getElementById('rm-liberado').checked,
      transportadora: transportadora || null,
      transportadora_cod: transportadoraCod,
      motorista: document.getElementById('rm-motorista').value || null,
      placa: placa || null,
      reboques: reboques || null,
      uf_carregamento: ufCarregamento,
      uf_descarregamento: ufDescarregamento,
      ufs_percurso: ufsPercurso
    };
    
    if (isEdit) {
      // Update Header
      const { error: headerError } = await supabase
        .from('expedicao_ordens_carregamento')
        .update(headerData)
        .eq('id', editId);
        
      if (headerError) throw headerError;
      
      // Insert or Update items, delete removed ones
      const itemsData = itens.map(i => ({ ...i, ordem_id: editId }));
      const currentIds = itemsData.map(i => i.id).filter(id => id);
      
      let delQuery = supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', editId);
      if (currentIds.length > 0) {
        delQuery = delQuery.not('id', 'in', `(${currentIds.join(',')})`);
      }
      
      const { error: delError } = await delQuery;
      if (delError) throw delError;
      
      const { error: itemsError } = await supabase
        .from('expedicao_ordens_carregamento_itens')
        .upsert(itemsData);
        
      if (itemsError) throw itemsError;
      
      showToast(`Ordem atualizada com sucesso!`, 'success');
    } else {
      // Insert Header
      const { data: header, error: headerError } = await supabase
        .from('expedicao_ordens_carregamento')
        .insert([headerData])
        .select('id, codigo_oc')
        .single();
        
      if (headerError) throw headerError;
      
      // Insert Items
      const itemsData = itens.map(i => ({ ...i, ordem_id: header.id }));
      const { error: itemsError } = await supabase
        .from('expedicao_ordens_carregamento_itens')
        .insert(itemsData);
        
      if (itemsError) throw itemsError;
      
      showToast(`Ordem ${header.codigo_oc} criada com sucesso!`, 'success');
    }
    
    document.getElementById('remessa-modal-container').innerHTML = '';
    await fetchRemessas();
    renderExpedicao();
    
  } catch (err) {
    console.error('Error saving remessa', err);
    showToast('Erro ao salvar Ordem de Carregamento. ' + err.message, 'error');
    document.getElementById('rm-loading-overlay').style.display = 'none';
  }
}

// Global listener to fetch data initially if needed
window.addEventListener('branch_changed', async () => {
  if (activeMainTab === 'ordem_carregamento') {
    await fetchRemessas();
    renderExpedicao();
  }
});
