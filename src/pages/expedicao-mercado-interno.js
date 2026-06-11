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
    const url = "/api/Items?$select=ItemCode,ItemName,ForeignName,ItemsGroupCode,SalesFactor1,SalesFactor2,SalesFactor3,SalesFactor4,U_Quality&$filter=ItemsGroupCode eq 106 and Properties1 eq 'tYES'";
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
    const url = "/api/SQLQueries('PedidoCompMI')/List?Prefer=odata.maxpagesize=0";
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true', 'Prefer': 'odata.maxpagesize=0', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    if (res.ok) {
      const data = await res.json();
      const rawList = data.value || [];
      
      const filtered = rawList.filter(row => {
         const rowBpl = row.BPLId !== undefined ? row.BPLId : row["'BPLId'"];
         return rowBpl == bplid;
      });

      const grouped = {};
      for (const row of filtered) {
         const docNum = row["Número"] || row["'Número'"] || row.DocEntry;
         const cardCode = row.CardCode || row["'CardCode'"];
         const cardName = row["Nome do PN"] || row["'Nome do PN'"];
         
         if (!grouped[docNum]) {
            grouped[docNum] = {
               DocNum: docNum,
               CardCode: cardCode,
               CardName: cardName,
               DocumentLines: []
            };
         }
         
         const itemDesc = row.ITEM || row["'ITEM'"];
         const frgnName = row.FrgnName || row["'FrgnName'"];
         const itemCode = frgnName || itemDesc; // Fallback se ItemCode não estiver na query
         
         const openQty = row["Quantidade Pendente"] || row["'Quantidade Pendente'"] || 0;
         const measureUnit = row.unitMsr || row["'unitMsr'"];
         
         grouped[docNum].DocumentLines.push({
            ItemCode: itemCode,
            ItemDescription: itemDesc,
            RemainingOpenQuantity: openQty,
            MeasureUnit: measureUnit,
            SalesFactor1: row.SalFactor1 || row["'SalFactor1'"] || 0,
            SalesFactor2: row.SalFactor2 || row["'SalFactor2'"] || 0,
            SalesFactor3: row.SalFactor3 || row["'SalFactor3'"] || 0
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
        <td>${t.local_partida || '-'} &rarr; ${t.cliente || '-'}</td>
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
      <div class="modal-content slide-up" style="background: var(--color-surface); border-radius: var(--radius-lg); width: 100%; max-width: 1000px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
        
        <div class="modal-header">
          <h2 class="modal-title">${isEdit ? 'Editar OC Mercado Interno #' + mi.id : 'Nova OC Mercado Interno'}</h2>
          <button type="button" class="btn btn-icon" onclick="document.getElementById('mi-modal-container').innerHTML = ''">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: var(--space-4);">
          <form id="mi-form" style="position: relative;">
            
            <div id="mi-loading-overlay" style="display: none; position: absolute; inset: 0; background: rgba(255,255,255,0.8); z-index: 10; flex-direction: column; align-items: center; justify-content: center; border-radius: var(--radius-md);">
              <div class="spinner" style="width: 40px; height: 40px; border-width: 3px; border-color: var(--color-primary); border-right-color: transparent;"></div>
              <span style="margin-top: var(--space-3); font-weight: 500; color: var(--color-text-secondary);">Carregando dados...</span>
            </div>
            
            <h3 style="font-size: var(--font-size-base); color: var(--color-text); margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">Cabeçalho</h3>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-5);">
              <div class="form-group">
                <label class="form-label">Data Prevista <span style="color: var(--color-danger);">*</span></label>
                <input type="datetime-local" id="mi-previsao" class="form-input" required>
              </div>
              <div class="form-group">
                <label class="form-label">Transportadora (Opcional)</label>
                <select class="form-select" id="mi-transportadora">
                  <option value="">Selecione...</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Placa do Veículo (Opcional)</label>
                <select class="form-select" id="mi-placa">
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
                <label class="form-label">Local de Partida <span style="color: var(--color-danger);">*</span></label>
                <select id="mi-local-partida" class="form-select" required>
                  <option value="">Selecione...</option>
                  <option value="PLY" ${mi && mi.local_partida === 'PLY' ? 'selected' : ''}>PLY</option>
                  <option value="OSB" ${mi && mi.local_partida === 'OSB' ? 'selected' : ''}>OSB</option>
                  <option value="PLUS" ${mi && mi.local_partida === 'PLUS' ? 'selected' : ''}>PLUS</option>
                </select>
              </div>
              <div class="form-group" style="grid-column: span 3;">
                <label class="form-label">Destino / Cliente (Opcional)</label>
                <input type="text" id="mi-cliente" class="form-input" placeholder="Cliente de destino..." value="${mi ? (mi.cliente || '') : ''}">
              </div>
              <div class="form-group" style="grid-column: span 4;">
                <label class="form-label">Buscar Pedido SAP (Preenche os itens)</label>
                <select id="mi-pedido" class="form-select">
                  <option value="">Selecione um pedido para carregar...</option>
                </select>
              </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">
              <h3 style="font-size: var(--font-size-base); color: var(--color-text);">Itens da OC</h3>
              <button type="button" id="btn-add-mi-item" class="btn btn-sm btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Adicionar Item Avulso
              </button>
            </div>
            
            <table class="table" style="margin-bottom: var(--space-4);">
              <thead>
                <tr>
                  <th style="width: 40px;"></th>
                  <th>Item</th>
                  <th style="width: 150px;">Tipo</th>
                  <th style="width: 150px;">Qtd (m³)</th>
                  <th style="width: 60px;">Ações</th>
                </tr>
              </thead>
              <tbody id="mi-items-tbody">
              </tbody>
            </table>
            
            <div id="mi-empty-state" style="text-align: center; padding: var(--space-6); color: var(--color-text-secondary); border: 1px dashed var(--color-border); border-radius: var(--radius-md); margin-top: var(--space-2);">
              Nenhum item adicionado.
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
  
  await Promise.all([
    fetchExpedicaoItems(),
    fetchOrders(),
    fetchLogisticaData()
  ]);

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

  const selectPedido = document.getElementById('mi-pedido');
  selectPedido.innerHTML = '<option value="">Selecione um pedido para carregar...</option>' + 
    ordersCache.map(o => `<option value="${o.DocNum}">${o.DocNum} - ${o.CardName || o.CardCode}</option>`).join('');
  
  selectPedido.addEventListener('change', async () => {
    const docNum = selectPedido.value;
    if (!docNum) return;
    
    const order = ordersCache.find(o => o.DocNum == docNum);
    if (!order) return;
    
    document.getElementById('mi-cliente').value = order.CardName || order.CardCode || '';
    
    // Clear existing
    document.getElementById('mi-items-tbody').innerHTML = '';
    
    for (const line of (order.DocumentLines || [])) {
      if (line.RemainingOpenQuantity <= 0) continue;
      
      let volumeM3 = 0;
      if (line.MeasureUnit && line.MeasureUnit.toUpperCase() === 'CH') {
        const comp = parseFloat(line.SalesFactor1) || 0;
        const larg = parseFloat(line.SalesFactor2) || 0;
        const bitola = parseFloat(line.SalesFactor3) || 0;
        volumeM3 = comp * larg * bitola * line.RemainingOpenQuantity;
      } else {
        volumeM3 = line.RemainingOpenQuantity; // Assume M3
      }
      
      const itemData = {
        item_code: line.ItemCode,
        item_name: line.ItemDescription,
        tipo: 'Obrigatório',
        quantidade_programada: volumeM3
      };
      
      addMercadoInternoItemRow(itemData);
    }
    
    document.getElementById('mi-empty-state').style.display = document.getElementById('mi-items-tbody').children.length > 0 ? 'none' : 'block';
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
    
    if (mi.expedicao_ordens_carregamento_itens && mi.expedicao_ordens_carregamento_itens.length > 0) {
      mi.expedicao_ordens_carregamento_itens.forEach(item => {
        addMercadoInternoItemRow(item);
      });
      document.getElementById('mi-empty-state').style.display = 'none';
    } else {
      addMercadoInternoItemRow();
    }
    
    if (mi.transportadora) {
       document.getElementById('mi-transportadora').value = mi.transportadora;
       // Dispara o change para filtrar as placas/motoristas
       const event = new Event('change');
       document.getElementById('mi-transportadora').dispatchEvent(event);
    }
    if (mi.placa) document.getElementById('mi-placa').value = mi.placa;
    if (mi.motorista) document.getElementById('mi-motorista').value = mi.motorista;
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

function addMercadoInternoItemRow(existingItem = null) {
  const tbody = document.getElementById('mi-items-tbody');
  document.getElementById('mi-empty-state').style.display = 'none';
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="text-align: center; color: var(--color-text-secondary);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></td>
    <td style="position: relative;">
      <input type="hidden" class="mi-item-db-id" value="${existingItem ? existingItem.id || '' : ''}" />
      <input type="text" class="form-input mi-item-input" placeholder="Digite para buscar..." autocomplete="off" required style="width: 100%;">
    </td>
    <td>
      <select class="form-select mi-tipo-select" style="width: 100%;" required>
        <option value="Obrigatório" ${existingItem && existingItem.tipo === 'Obrigatório' ? 'selected' : ''}>Obrigatório</option>
        <option value="Complementar" ${existingItem && existingItem.tipo === 'Complementar' ? 'selected' : ''}>Complementar</option>
      </select>
    </td>
    <td>
      <input type="number" class="form-input mi-qtd-prog" placeholder="Ex: 40" value="${existingItem && existingItem.quantidade_programada ? parseFloat(existingItem.quantidade_programada).toFixed(4) : ''}" step="any" required>
    </td>
    <td style="text-align: center;">
      <button type="button" class="btn btn-sm btn-icon btn-remove-mi-item" title="Remover" style="color: var(--color-danger);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </td>
  `;
  
  if (existingItem) {
    tr.querySelector('.mi-item-input').value = existingItem.item_code + ' - ' + (existingItem.item_name || '');
  }
  
  const selectTipo = tr.querySelector('.mi-tipo-select');
  const inputQtdProg = tr.querySelector('.mi-qtd-prog');

  function updateQtdState() {
    if (selectTipo.value === 'Complementar') {
      inputQtdProg.value = '';
      inputQtdProg.disabled = true;
      inputQtdProg.required = false;
    } else {
      inputQtdProg.disabled = false;
      inputQtdProg.required = true;
    }
  }

  selectTipo.addEventListener('change', updateQtdState);
  updateQtdState(); // Run once for initial state
  
  // Custom dropdown logic
  const inputItem = tr.querySelector('.mi-item-input');
  const dropdownItem = document.createElement('div');
  dropdownItem.className = 'mi-item-dropdown';
  dropdownItem.style.cssText = 'display: none; position: fixed; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-height: 250px; overflow-y: auto; z-index: 999999;';
  document.body.appendChild(dropdownItem);

  const options = expedicaoItemsCache.map(i => {
    const display = i.ForeignName || i.ItemName;
    return { text: `${i.ItemCode} - ${display}` };
  });

  function positionDropdown() {
    const rect = inputItem.getBoundingClientRect();
    dropdownItem.style.top = (rect.bottom + 4) + 'px';
    dropdownItem.style.left = rect.left + 'px';
    dropdownItem.style.width = rect.width + 'px';
  }

  function renderDropdown(filterText = '') {
    const lowerFilter = filterText.toLowerCase();
    const filtered = options.filter(o => o.text.toLowerCase().includes(lowerFilter));
    dropdownItem.innerHTML = filtered.map(o => `
      <div class="mi-dropdown-option" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--color-border-light); font-size: 13px;" data-value="${o.text}">
        ${o.text}
      </div>
    `).join('');
    
    dropdownItem.querySelectorAll('.mi-dropdown-option').forEach(opt => {
      opt.addEventListener('mousedown', (e) => { // mousedown runs before blur
        inputItem.value = e.currentTarget.dataset.value;
        dropdownItem.style.display = 'none';
      });
      opt.addEventListener('mouseenter', (e) => {
        e.currentTarget.style.background = 'var(--color-bg-hover, #f3f4f6)';
      });
      opt.addEventListener('mouseleave', (e) => {
        e.currentTarget.style.background = '';
      });
    });
  }

  inputItem.addEventListener('focus', () => {
    positionDropdown();
    renderDropdown(inputItem.value);
    dropdownItem.style.display = 'block';
  });

  inputItem.addEventListener('input', () => {
    positionDropdown();
    renderDropdown(inputItem.value);
    dropdownItem.style.display = 'block';
  });

  inputItem.addEventListener('blur', () => {
    dropdownItem.style.display = 'none';
  });
  
  const modalBody = document.getElementById('mi-modal-container')?.querySelector('.modal-body');
  if (modalBody) {
    modalBody.addEventListener('scroll', () => {
      dropdownItem.style.display = 'none';
    }, { passive: true });
  }

  tr.querySelector('.btn-remove-mi-item').addEventListener('click', () => {
    if (dropdownItem && dropdownItem.parentNode) {
      dropdownItem.parentNode.removeChild(dropdownItem);
    }
    tr.remove();
    if (tbody.children.length === 0) {
      document.getElementById('mi-empty-state').style.display = 'block';
    }
  });
  
  tbody.appendChild(tr);
  return tr;
}

async function saveMercadoInterno(isEdit, editId) {
  const previsao = document.getElementById('mi-previsao').value;
  const localPartida = document.getElementById('mi-local-partida').value;
  
  if (!previsao || !localPartida) {
    showToast('Data Prevista e Local de Partida são obrigatórios.', 'error');
    return;
  }
  
  const tbody = document.getElementById('mi-items-tbody');
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) {
    showToast('Adicione pelo menos um item à ordem.', 'error');
    return;
  }
  
  const pedidoSelecionado = document.getElementById('mi-pedido').value;

  const itens = [];
  for (const tr of rows) {
    const itemInput = tr.querySelector('.mi-item-input').value.trim();
    if (!itemInput) {
      showToast('Selecione um item em todas as linhas.', 'error');
      return;
    }
    
    const parts = itemInput.split(' - ');
    const itemCode = parts[0];
    const itemName = parts.slice(1).join(' - ');
    const tipo = tr.querySelector('.mi-tipo-select').value;
    const qtdProg = tr.querySelector('.mi-qtd-prog').value;
    const dbId = tr.querySelector('.mi-item-db-id').value;
    
    if (!itemCode) {
      showToast('Selecione um item válido em todas as linhas.', 'error');
      return;
    }
    
    if (tipo === 'Obrigatório' && !qtdProg) {
      showToast('A Quantidade é obrigatória nos itens do tipo Obrigatório.', 'error');
      return;
    }
    
    const newItem = {
      pedido_numero: pedidoSelecionado || 'MERCADO INTERNO',
      item_code: itemCode,
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
      transportadora: document.getElementById('mi-transportadora').value || null,
      placa: document.getElementById('mi-placa').value || null,
      motorista: document.getElementById('mi-motorista').value || null,
      cliente: document.getElementById('mi-cliente').value || null,
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
