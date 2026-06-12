import { getBPLID } from '../auth/auth.js';
import { supabase } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { fetchRemessas, fetchLogisticaData, mercadoInternoCache, getMercadoInternoStatusFilter, setMercadoInternoStatusFilter, renderExpedicao, empresasCache, motoristasCache, placasCache } from './expedicao.js';
import { printRomaneioReport } from '../components/romaneio-report.js';

let expedicaoItemsCache = [];
let ordersCache = [];

export async function fetchExpedicaoItems() {
  if (expedicaoItemsCache.length > 0) return expedicaoItemsCache;
  try {
    const url = "https://tableros.ngrok.app/Items?$select=ItemCode,ItemName,ForeignName,ItemsGroupCode,SalesFactor1,SalesFactor2,SalesFactor3,SalesFactor4,U_Quality&$filter=ItemsGroupCode eq 106 and Properties1 eq 'tYES'";
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true', 'Prefer': 'odata.maxpagesize=0', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    if (res.ok) {
      const data = await res.json();
      expedicaoItemsCache = data.value || [];
    }
  } catch(e) { console.error('Error fetching Items', e); }
  return expedicaoItemsCache;
}

export async function fetchOrders() {
  if (ordersCache.length > 0) return ordersCache;
  try {
    const bplid = getBPLID();
    const url = "https://tableros.ngrok.app/SQLQueries('PedidoCompMI')/List";
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true', 'Prefer': 'odata.maxpagesize=0', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    if (res.ok) {
      const data = await res.json();
      const rawList = data.value || [];
      
      const filtered = rawList.filter(row => {
         const rowBpl = row.BPLId !== undefined ? row.BPLId : row["'BPLId'"];
         const cardCode = row.CardCode || row["'CardCode'"];
         // Filtra filial logada e remove C0005, C0028 e C0011 caso ainda venham do SAP
         return rowBpl == bplid && cardCode !== 'C0005' && cardCode !== 'C0028' && cardCode !== 'C0011';
      });

      const grouped = {};
      for (const row of filtered) {
         const keys = Object.keys(row);
         
         const docNumKey = keys.find(k => k.includes('mero') || k.includes('DocEntry') || k === 'DocNum');
         const cardNameKey = keys.find(k => k.includes('Nome do PN'));
         const itemKey = keys.find(k => k.includes('ITEM') || k.includes('Dscription'));
         const qtyKey = keys.find(k => k.includes('Pendente') || k.includes('OpenInvQty'));
         
         const docNum = row[docNumKey];
         const cardCode = row.CardCode || row["'CardCode'"];
         const cardName = row[cardNameKey];
         
         if (!grouped[docNum]) {
            grouped[docNum] = {
               DocNum: docNum,
               CardCode: cardCode,
               CardName: cardName,
               DocumentLines: []
            };
         }
         
         const itemDesc = row[itemKey];
         const frgnName = row.FrgnName || row["'FrgnName'"];
         const itemCode = frgnName || itemDesc;
         
         const openQty = row[qtyKey] || 0;
         const measureUnit = row.unitMsr || row["'unitMsr'"];
         
         // Calculate Volume directly
         let volumeM3 = 0;
         if (measureUnit && measureUnit.toUpperCase() === 'CH') {
           const comp = parseFloat(row.SalFactor1 || row["'SalFactor1'"]) || 0;
           const larg = parseFloat(row.SalFactor2 || row["'SalFactor2'"]) || 0;
           const bitola = parseFloat(row.SalFactor3 || row["'SalFactor3'"]) || 0;
           volumeM3 = comp * larg * bitola * openQty;
         } else {
           volumeM3 = openQty;
         }

         grouped[docNum].DocumentLines.push({
            ItemCode: itemCode,
            ItemDescription: itemDesc,
            RemainingOpenQuantity: openQty,
            VolumeM3: volumeM3,
            MeasureUnit: measureUnit
         });
      }
      ordersCache = Object.values(grouped);
    }
  } catch(e) { console.error('Error fetching Orders', e); }
  return ordersCache;
}

export function renderMercadoInternoTab(canCreate, canEdit, canDelete) {
  let tbody = `<tr><td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma ordem de mercado interno encontrada.</td></tr>`;
  
  if (mercadoInternoCache && mercadoInternoCache.length > 0) {
    tbody = mercadoInternoCache.map(t => `
      <tr class="table-row-hover">
        <td style="font-weight: 500;">${t.codigo_oc || '-'}</td>
        <td>${new Date(t.previsao_carga).toLocaleString('pt-BR')}</td>
        <td>${t.local_partida || '-'} &rarr; Mercado Interno</td>
        <td>${t.transportadora || '-'}</td>
        <td>${t.placa || '-'}</td>
        <td>${t.itens_count || 0}</td>
        <td>
          <span class="badge" style="background: ${t.status === 'Ativa' ? 'var(--color-primary-light)' : 'var(--color-surface-alt)'}; color: ${t.status === 'Ativa' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: 1px solid ${t.status === 'Ativa' ? 'var(--color-primary)' : 'var(--color-border)'};">
            ${t.status || 'Ativa'}
          </span>
        </td>
        <td style="text-align: right;">
          ${t.status === 'Finalizada' ? `
          <button class="btn btn-sm btn-icon btn-view-mi" data-id="${t.id}" title="Ver">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
          ` : ''}
          ${canEdit ? `
          <button class="btn btn-sm btn-icon btn-edit-mi" data-id="${t.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>` : ''}
          ${canDelete ? `
          <button class="btn btn-sm btn-icon btn-delete-mi" data-id="${t.id}" title="Excluir" style="color: var(--color-danger);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  const currentFilter = getMercadoInternoStatusFilter();

  return `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <select id="mi-status-filter" class="filter-select" style="font-size: var(--font-size-sm); height: 34px; width: 160px;">
          <option value="Todas" ${currentFilter === 'Todas' ? 'selected' : ''}>Todas as OCs</option>
          <option value="Ativa" ${currentFilter === 'Ativa' ? 'selected' : ''}>Ativas</option>
          <option value="Concluída" ${currentFilter === 'Concluída' ? 'selected' : ''}>Concluídas</option>
        </select>
      </div>
      <div class="flex" style="gap: 12px; margin-left: auto;">
        ${canCreate ? `
        <button id="btn-new-mi" class="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nova OC Mercado Interno
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
              <th style="font-size: var(--font-size-xs);">Rota</th>
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

export function bindMercadoInternoEvents() {
  const filterMI = document.getElementById('mi-status-filter');
  if (filterMI) {
    filterMI.addEventListener('change', async (e) => {
      setMercadoInternoStatusFilter(e.target.value);
      await fetchRemessas();
      renderExpedicao();
    });
  }

  const btnNew = document.getElementById('btn-new-mi');
  if (btnNew) {
    btnNew.addEventListener('click', () => showMercadoInternoModal());
  }

  document.querySelectorAll('.btn-edit-mi').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showMercadoInternoModal(id);
    });
  });

  document.querySelectorAll('.btn-view-mi').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      printRomaneioReport(id);
    });
  });

  document.querySelectorAll('.btn-delete-mi').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const confirmed = await confirmDialog('Excluir OC', 'Tem certeza que deseja excluir esta OC de Mercado Interno?');
      if (!confirmed) return;
      
      try {
        await supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', id);
        const { error } = await supabase.from('expedicao_ordens_carregamento').delete().eq('id', id);
        if (error) throw error;
        
        showToast('OC excluída com sucesso!', 'success');
        await fetchRemessas();
        window.dispatchEvent(new Event('expedicao_changed'));
      } catch (err) {
        console.error('Error deleting OC', err);
        showToast('Erro ao excluir OC', 'error');
      }
    });
  });
}

function showMercadoInternoModal(editId = null) {
  const mi = editId ? mercadoInternoCache.find(t => t.id == editId) : null;
  const isEdit = !!mi;
  
  let modalContainer = document.getElementById('mi-modal-container');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'mi-modal-container';
    document.body.appendChild(modalContainer);
  }

  modalContainer.innerHTML = `
    <div class="modal-backdrop fade-in" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
      <div class="modal-content slide-up" style="background: var(--color-surface); border-radius: var(--radius-lg); width: 100%; max-width: 1200px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
        
        <div class="modal-header" style="padding: var(--space-4); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
          <h2 class="modal-title" style="font-size: var(--font-size-xl); font-weight: 600;">${isEdit ? 'Editar OC Mercado Interno #' + mi.id : 'Nova OC Mercado Interno'}</h2>
          <button type="button" class="btn btn-icon" onclick="document.getElementById('mi-modal-container').innerHTML = ''">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: var(--space-4);">
          <form id="mi-form" style="position: relative;">
            
            <div id="mi-loading-overlay" style="display: none; position: absolute; top: -20px; left: -20px; right: -20px; bottom: -20px; background: rgba(255,255,255,0.85); z-index: 100; flex-direction: column; justify-content: flex-start; align-items: center; padding-top: 150px; border-radius: var(--radius-lg); backdrop-filter: blur(2px);">
              <div class="spinner" style="width: 40px; height: 40px; border-width: 4px; border-color: var(--color-primary); border-right-color: transparent; margin-bottom: var(--space-4);"></div>
              <span style="color: var(--color-text); font-weight: 600; font-size: 1.1rem;">Sincronizando com o SAP...</span>
              <span style="color: var(--color-text-secondary); font-size: 0.9rem; margin-top: 4px;">Isso pode levar alguns segundos.</span>
            </div>
            
            <!-- Dados Gerais (Cabeçalho) -->
            <div style="background: var(--color-surface-alt); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-6); border: 1px solid var(--color-border-light);">
              <h3 style="font-size: var(--font-size-base); margin-bottom: var(--space-4); color: var(--color-text);">Dados Gerais (Cabeçalho)</h3>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4);">
                
                <div class="form-group">
                  <label class="form-label">Previsão de Carga <span style="color: var(--color-danger);">*</span></label>
                  <input type="datetime-local" class="form-input" id="mi-previsao" required>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Local de Partida <span style="color: var(--color-danger);">*</span></label>
                  <select id="mi-local-partida" class="form-select" required>
                    <option value="">Selecione...</option>
                    <option value="PLY" ${mi && mi.local_partida === 'PLY' ? 'selected' : ''}>PLY</option>
                    <option value="OSB" ${mi && mi.local_partida === 'OSB' ? 'selected' : ''}>OSB</option>
                    <option value="PLUS" ${mi && mi.local_partida === 'PLUS' ? 'selected' : ''}>PLUS</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Transportadora (Opcional)</label>
                  <select class="form-select" id="mi-transportadora">
                    <option value="">Selecione...</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Motorista (Opcional)</label>
                  <select class="form-select" id="mi-motorista">
                    <option value="">Selecione...</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Placa (Tração) (Opcional)</label>
                  <select class="form-select" id="mi-placa">
                    <option value="">Selecione...</option>
                  </select>
                </div>

              </div>
            </div>
            
            <!-- Itens -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
              <h3 style="font-size: var(--font-size-lg); color: var(--color-text);">Itens da Remessa</h3>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-add-mi-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Adicionar Pedido
              </button>
            </div>
            
            <table class="table" style="margin-bottom: var(--space-4);">
              <thead>
                <tr>
                  <th style="width: 30%;">Pedido & Destino</th>
                  <th style="width: 40%;">Item</th>
                  <th style="width: 25%;">Programação</th>
                  <th style="width: 50px;">Ações</th>
                </tr>
              </thead>
              <tbody id="mi-items-tbody">
              </tbody>
            </table>
            
            <div id="mi-empty-state" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary); border: 1px dashed var(--color-border); border-radius: var(--radius-md);">
              Nenhum pedido adicionado à ordem de carregamento.
            </div>

          </form>
        </div>
        
        <div style="padding: var(--space-4); border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: var(--space-3); background: var(--color-surface-alt);">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('mi-modal-container').innerHTML = ''">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-save-mi">Salvar Ordem</button>
        </div>

      </div>
    </div>
  `;
  
  initMercadoInternoForm(isEdit, mi);
}

async function initMercadoInternoForm(isEdit, mi) {
  const overlay = document.getElementById('mi-loading-overlay');
  overlay.style.display = 'flex';
  
  await fetchExpedicaoItems();
  await fetchOrders();
  await fetchLogisticaData();

  const selectTransp = document.getElementById('mi-transportadora');
  if (selectTransp.options.length <= 1) {
    selectTransp.innerHTML = '<option value="">Selecione...</option>' + 
      empresasCache.map(e => `<option value="${e.nome_fantasia}" data-cnpj="${e.cnpj}" data-cod="${e.card_code}">${e.nome_fantasia} (${e.cnpj})</option>`).join('');
  }
  
  const selectPlaca = document.getElementById('mi-placa');
  if (selectPlaca.options.length <= 1) {
    selectPlaca.innerHTML = '<option value="">Selecione...</option>' + 
      placasCache.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
  }

  const selectMotorista = document.getElementById('mi-motorista');
  if (selectMotorista.options.length <= 1) {
    selectMotorista.innerHTML = '<option value="">Selecione...</option>' + 
      motoristasCache.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  }

  selectTransp.addEventListener('change', (e) => {
    const selectedOption = e.target.selectedOptions[0];
    const cnpj = selectedOption ? selectedOption.dataset.cnpj : null;
    
    let filteredPlacas = placasCache;
    if (cnpj) {
      filteredPlacas = placasCache.filter(p => p.empresa_cnpj === cnpj);
    }
    selectPlaca.innerHTML = '<option value="">Selecione...</option>' + 
      filteredPlacas.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
      
    let filteredMotoristas = motoristasCache;
    if (cnpj) {
      filteredMotoristas = motoristasCache.filter(m => m.empresa_cnpj === cnpj);
    }
    selectMotorista.innerHTML = '<option value="">Selecione...</option>' + 
      filteredMotoristas.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  });

  document.getElementById('btn-add-mi-item').addEventListener('click', () => {
    addMercadoInternoItemRow();
  });
  
  document.getElementById('btn-save-mi').addEventListener('click', async () => {
    const editId = isEdit && mi ? mi.id : null;
    await saveMercadoInterno(isEdit, editId);
  });
  
  if (isEdit && mi) {
    if (mi.previsao_carga) {
      const date = new Date(mi.previsao_carga);
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
      document.getElementById('mi-previsao').value = localISOTime;
    }
    
    if (mi.transportadora) {
       document.getElementById('mi-transportadora').value = mi.transportadora;
       document.getElementById('mi-transportadora').dispatchEvent(new Event('change'));
    }
    if (mi.placa) document.getElementById('mi-placa').value = mi.placa;
    if (mi.motorista) document.getElementById('mi-motorista').value = mi.motorista;
    
    if (mi.expedicao_ordens_carregamento_itens && mi.expedicao_ordens_carregamento_itens.length > 0) {
      mi.expedicao_ordens_carregamento_itens.forEach(item => {
        const tr = addMercadoInternoItemRow();
        tr.querySelector('.mi-item-db-id').value = item.id;
        
        const selectPedido = tr.querySelector('.mi-pedido-select');
        selectPedido.value = item.pedido_numero;
        selectPedido.dispatchEvent(new Event('change'));
        
        setTimeout(() => {
          const selectItem = tr.querySelector('.mi-item-select');
          const options = Array.from(selectItem.options);
          const match = options.find(o => o.dataset.realcode === item.item_code);
          if (match) {
            selectItem.value = match.value;
          } else {
            selectItem.value = item.item_code;
          }
          selectItem.dispatchEvent(new Event('change'));
          
          const selectTipo = tr.querySelector('.mi-tipo-select');
          selectTipo.value = item.tipo;
          selectTipo.dispatchEvent(new Event('change'));
          
          const inputQtdProg = tr.querySelector('.mi-qtd-prog');
          inputQtdProg.value = item.quantidade_programada;
        }, 100);
      });
    } else {
      addMercadoInternoItemRow();
    }
  } else {
    // New
    const date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
    document.getElementById('mi-previsao').value = localISOTime;
    addMercadoInternoItemRow();
  }
  
  overlay.style.display = 'none';
}

function addMercadoInternoItemRow() {
  const tbody = document.getElementById('mi-items-tbody');
  const emptyState = document.getElementById('mi-empty-state');
  
  emptyState.style.display = 'none';
  
  const tr = document.createElement('tr');
  const uniqueId = 'item_' + Math.random().toString(36).substr(2, 9);
  tr.id = uniqueId;
  
  // Options for Pedido
  const uniquePedidos = ordersCache.map(p => p.DocNum);
  const pedidoOptions = `<option value="">Selecione...</option>` + 
    uniquePedidos.map(num => `<option value="${num}">${num}</option>`).join('');

  tr.innerHTML = `
    <td style="vertical-align: top;">
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        <input type="hidden" class="mi-item-db-id" />
        <select class="form-select mi-pedido-select" style="width: 100%;" required>
          ${pedidoOptions}
        </select>
        <input type="text" class="form-input mi-destino" readonly placeholder="Destino" style="width: 100%; background: var(--color-surface-alt); font-size: 11px;" />
        <input type="hidden" class="mi-cod-pn" />
      </div>
    </td>
    <td style="vertical-align: top;">
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        <select class="form-select mi-item-select" style="width: 100%;" required disabled>
          <option value="">Selecione um pedido primeiro...</option>
        </select>
        <div style="display: flex; gap: var(--space-2); align-items: center;">
          <span style="font-size: 11px; color: var(--color-text-secondary); white-space: nowrap;">Vol Pendente (m³):</span>
          <input type="number" class="form-input mi-qtd-pendente" readonly style="width: 100px; background: var(--color-surface-alt);" />
          <small class="mi-qtd-info" style="font-size: 10px; color: var(--color-text-secondary);"></small>
        </div>
      </div>
    </td>
    <td style="vertical-align: top;">
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        <select class="form-select mi-tipo-select" style="width: 100%;" required>
          <option value="Obrigatório">Obrigatório</option>
          <option value="Complementar">Complementar</option>
        </select>
        <input type="number" step="0.01" class="form-input mi-qtd-prog" placeholder="Vol a Programar (m³)" style="width: 100%;" required />
      </div>
    </td>
    <td style="text-align: center; vertical-align: middle;">
      <button type="button" class="btn btn-sm btn-icon btn-remove-row" style="color: var(--color-danger);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </td>
  `;
  
  tbody.appendChild(tr);
  
  bindMercadoInternoRowEvents(tr);
  
  return tr;
}

function bindMercadoInternoRowEvents(tr) {
  const btnRemove = tr.querySelector('.btn-remove-row');
  btnRemove.addEventListener('click', () => {
    tr.remove();
    const tbody = document.getElementById('mi-items-tbody');
    if (tbody.children.length === 0) {
      document.getElementById('mi-empty-state').style.display = 'block';
    }
  });

  const selectPedido = tr.querySelector('.mi-pedido-select');
  const inputDestino = tr.querySelector('.mi-destino');
  const inputCodPn = tr.querySelector('.mi-cod-pn');
  const selectItem = tr.querySelector('.mi-item-select');
  
  const selectTipo = tr.querySelector('.mi-tipo-select');
  const inputQtdProg = tr.querySelector('.mi-qtd-prog');
  const inputQtdPendente = tr.querySelector('.mi-qtd-pendente');
  
  selectPedido.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) {
      inputDestino.value = '';
      selectItem.innerHTML = '<option value="">Selecione um pedido primeiro...</option>';
      selectItem.disabled = true;
      return;
    }
    
    const pedido = ordersCache.find(p => String(p.DocNum) === String(val));
    if (pedido) {
      inputDestino.value = `${pedido.CardName || ''} (${pedido.CardCode || ''})`;
      inputCodPn.value = pedido.CardCode || '';
      
      let itemOptions = '<option value="">Selecione o Item...</option>';
      pedido.DocumentLines.forEach((line, index) => {
        // Exibir m3 na tela mas carregar informações
        itemOptions += `<option value="${line.ItemCode}__${index}" data-realcode="${line.ItemCode}" data-name="${line.ItemDescription}" data-pendente="${line.VolumeM3 || 0}">${line.ItemCode} - ${line.ItemDescription}</option>`;
      });
      
      selectItem.innerHTML = itemOptions;
      selectItem.disabled = false;
    }
  });
  
  selectItem.addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    if (option && option.value) {
      const pendente = parseFloat(option.dataset.pendente) || 0;
      
      inputQtdPendente.value = pendente > 0 ? pendente.toFixed(4) : 0;
      
      if (selectTipo.value === 'Obrigatório') {
        inputQtdProg.max = pendente > 0 ? pendente : 0;
      }
    } else {
      inputQtdPendente.value = '';
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
        e.target.value = pendente.toFixed(4);
      }
    }
  });
}

async function saveMercadoInterno(isEdit, editId) {
  const previsao = document.getElementById('mi-previsao').value;
  const localPartida = document.getElementById('mi-local-partida').value;
  
  if (!previsao || !localPartida) {
    showToast('Data Prevista e Local de Partida são obrigatórios.', 'error');
    return;
  }
  
  const transpSelect = document.getElementById('mi-transportadora');
  const transportadora = transpSelect.value;
  const transportadoraCod = transpSelect.selectedOptions[0]?.dataset?.cod || null;
  const placa = document.getElementById('mi-placa').value;
  const motorista = document.getElementById('mi-motorista').value;
  
  const tbody = document.getElementById('mi-items-tbody');
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) {
    showToast('Adicione pelo menos um item à ordem.', 'error');
    return;
  }

  const itens = [];
  for (const tr of rows) {
    const pedidoSelect = tr.querySelector('.mi-pedido-select');
    const itemSelect = tr.querySelector('.mi-item-select');
    
    const pedidoNumero = pedidoSelect.value;
    if (!pedidoNumero) {
      showToast('Selecione o pedido em todas as linhas.', 'error');
      return;
    }
    
    if (!itemSelect.value) {
      showToast('Selecione o item em todas as linhas.', 'error');
      return;
    }
    
    const selectedOption = itemSelect.selectedOptions[0];
    const realCode = selectedOption.dataset.realcode;
    const itemName = selectedOption.dataset.name;
    const codPn = tr.querySelector('.mi-cod-pn').value;
    
    const tipo = tr.querySelector('.mi-tipo-select').value;
    const qtdProg = tr.querySelector('.mi-qtd-prog').value;
    const dbId = tr.querySelector('.mi-item-db-id').value;
    
    if (tipo === 'Obrigatório' && !qtdProg) {
      showToast('A Quantidade é obrigatória nos itens do tipo Obrigatório.', 'error');
      return;
    }
    
    const newItem = {
      pedido_numero: pedidoNumero,
      cod_pn: codPn,
      item_code: realCode,
      item_name: itemName,
      tipo: tipo,
      quantidade_programada: tipo === 'Obrigatório' ? (parseFloat(qtdProg.replace(',', '.')) || 0) : null
    };
    if (dbId) newItem.id = dbId;
    itens.push(newItem);
  }
  
  try {
    const btnSave = document.getElementById('btn-save-mi');
    btnSave.disabled = true;
    btnSave.textContent = 'Salvando...';
    
    const headerData = {
      bplid: getBPLID(),
      tipo: 'mercado_interno',
      previsao_carga: new Date(previsao).toISOString(),
      transportadora: transportadora || null,
      transportadora_cod: transportadoraCod || null,
      placa: placa || null,
      motorista: motorista || null,
      local_partida: localPartida,
      liberado_carregamento: true
    };
    
    if (isEdit) {
      const { error: headerError } = await supabase.from('expedicao_ordens_carregamento').update(headerData).eq('id', editId);
      if (headerError) throw headerError;
      
      if (itens.length > 0) {
        const itensPayload = itens.map(i => ({ ...i, ordem_id: editId }));
        const currentIds = itensPayload.map(i => i.id).filter(id => id);
        
        let delQuery = supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', editId);
        if (currentIds.length > 0) {
          delQuery = delQuery.not('id', 'in', `(${currentIds.join(',')})`);
        }
        
        const { error: delError } = await delQuery;
        if (delError) throw delError;
        
        const { error: insError } = await supabase.from('expedicao_ordens_carregamento_itens').upsert(itensPayload);
        if (insError) throw insError;
      } else {
        const { error: delError } = await supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', editId);
        if (delError) throw delError;
      }
    } else {
      const { data: ocData, error: ocError } = await supabase.from('expedicao_ordens_carregamento').insert(headerData).select('id').single();
      if (ocError) throw ocError;
      
      if (itens.length > 0) {
        const itensPayload = itens.map(i => ({ ...i, ordem_id: ocData.id }));
        const { error: insError } = await supabase.from('expedicao_ordens_carregamento_itens').insert(itensPayload);
        if (insError) throw insError;
      }
    }
    
    showToast(isEdit ? 'OC atualizada!' : 'OC criada com sucesso!', 'success');
    document.getElementById('mi-modal-container').innerHTML = '';
    await fetchRemessas();
    window.dispatchEvent(new Event('expedicao_changed'));
  } catch (err) {
    console.error('Error saving OC', err);
    showToast('Erro ao salvar OC: ' + (err.message || err.toString()), 'error');
    document.getElementById('btn-save-mi').disabled = false;
    document.getElementById('btn-save-mi').textContent = 'Salvar Ordem';
  }
}
