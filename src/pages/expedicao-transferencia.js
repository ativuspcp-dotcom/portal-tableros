import { getBPLID } from '../auth/auth.js';
import { supabase } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { fetchRemessas, transferenciasCache } from './expedicao.js';

let expedicaoItemsCache = [];

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

export function renderTransferenciaInternaTab(canCreate, canEdit, canDelete) {
  let tbody = `<tr><td colspan="6" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma transferência interna encontrada.</td></tr>`;
  
  if (transferenciasCache && transferenciasCache.length > 0) {
    tbody = transferenciasCache.map(t => `
      <tr class="table-row-hover">
        <td style="font-family: monospace; font-weight: var(--font-weight-semibold);">${t.id}</td>
        <td>${new Date(t.previsao_carga).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td style="font-weight: 500;">${t.local_partida || '-'} &rarr; ${t.local_destino || '-'}</td>
        <td>${t.transportadora || '-'} (${t.placa || '-'})</td>
        <td style="text-align: center;"><span class="badge" style="background: var(--color-surface-alt);">${t.itens_count || 0} itens</span></td>
        <td style="text-align: right;">
          <button class="btn btn-sm btn-icon btn-view-transf" data-id="${t.id}" title="Ver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
          ${canEdit ? `
          <button class="btn btn-sm btn-icon btn-edit-transf" data-id="${t.id}" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>` : ''}
          ${canDelete ? `
          <button class="btn btn-sm btn-icon btn-delete-transf" data-id="${t.id}" title="Excluir" style="color: var(--color-danger);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  return `
    <div class="card" style="padding: var(--space-4);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
        <h2 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--color-text);">Transferências Internas</h2>
        ${canCreate ? `
        <button id="btn-new-transf" class="btn btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nova Transferência
        </button>` : ''}
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 80px;">OC ID</th>
              <th>Data/Hora</th>
              <th>Rota (Partida &rarr; Destino)</th>
              <th>Transporte</th>
              <th style="text-align: center;">Volumes</th>
              <th style="text-align: right; width: 140px;">Ações</th>
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

export function bindTransferenciaEvents() {
  const btnNew = document.getElementById('btn-new-transf');
  if (btnNew) {
    btnNew.addEventListener('click', () => showTransferenciaModal());
  }

  document.querySelectorAll('.btn-view-transf, .btn-edit-transf').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showTransferenciaModal(id);
    });
  });

  document.querySelectorAll('.btn-delete-transf').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const confirmed = await confirmDialog('Excluir Transferência', 'Tem certeza que deseja excluir esta Transferência Interna?');
      if (!confirmed) return;
      
      try {
        await supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', id);
        const { error } = await supabase.from('expedicao_ordens_carregamento').delete().eq('id', id);
        if (error) throw error;
        
        showToast('Transferência excluída com sucesso!', 'success');
        await fetchRemessas();
        window.dispatchEvent(new Event('expedicao_changed'));
      } catch (err) {
        console.error('Error deleting transferencia', err);
        showToast('Erro ao excluir transferência', 'error');
      }
    });
  });
}

function showTransferenciaModal(editId = null) {
  const transf = editId ? transferenciasCache.find(t => t.id == editId) : null;
  const isEdit = !!transf;
  
  let modalContainer = document.getElementById('transf-modal-container');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'transf-modal-container';
    document.body.appendChild(modalContainer);
  }

  modalContainer.innerHTML = `
    <div class="modal-backdrop fade-in" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
      <div class="modal-content slide-up" style="background: var(--color-surface); border-radius: var(--radius-lg); width: 100%; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
        
        <div class="modal-header">
          <h2 class="modal-title">${isEdit ? 'Editar Transferência #' + transf.id : 'Nova Transferência Interna'}</h2>
          <button type="button" class="btn btn-icon" onclick="document.getElementById('transf-modal-container').innerHTML = ''">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div class="modal-body" style="flex: 1; overflow-y: auto; padding: var(--space-4);">
          <form id="transf-form" style="position: relative;">
            
            <div id="tf-loading-overlay" style="display: none; position: absolute; inset: 0; background: rgba(255,255,255,0.8); z-index: 10; flex-direction: column; align-items: center; justify-content: center; border-radius: var(--radius-md);">
              <div class="spinner" style="width: 40px; height: 40px; border-width: 3px; border-color: var(--color-primary); border-right-color: transparent;"></div>
              <span style="margin-top: var(--space-3); font-weight: 500; color: var(--color-text-secondary);">Carregando dados...</span>
            </div>
            
            <h3 style="font-size: var(--font-size-base); color: var(--color-text); margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">Cabeçalho da Transferência</h3>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-5);">
              <div>
                <label class="form-label">Data Prevista <span style="color: var(--color-danger);">*</span></label>
                <input type="datetime-local" id="tf-previsao" class="form-input" required>
              </div>
              <div>
                <label class="form-label">Transportadora</label>
                <input type="text" id="tf-transportadora" class="form-input" placeholder="Nome da Transportadora">
              </div>
              <div>
                <label class="form-label">Placa do Veículo</label>
                <input type="text" id="tf-placa" class="form-input" placeholder="ABC-1234">
              </div>
              <div>
                <label class="form-label">Motorista</label>
                <input type="text" id="tf-motorista" class="form-input" placeholder="Nome do Motorista">
              </div>
              <div>
                <label class="form-label">Local de Partida <span style="color: var(--color-danger);">*</span></label>
                <select id="tf-local-partida" class="form-select" required>
                  <option value="">Selecione...</option>
                  <option value="PLY">PLY</option>
                  <option value="OSB">OSB</option>
                  <option value="PLUS">PLUS</option>
                </select>
              </div>
              <div>
                <label class="form-label">Local de Destino <span style="color: var(--color-danger);">*</span></label>
                <select id="tf-local-destino" class="form-select" required>
                  <option value="">Selecione...</option>
                  <option value="PLY">PLY</option>
                  <option value="OSB">OSB</option>
                  <option value="PLUS">PLUS</option>
                </select>
              </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border-light);">
              <h3 style="font-size: var(--font-size-base); color: var(--color-text);">Itens da Transferência</h3>
              <button type="button" id="btn-add-tf-item" class="btn btn-sm btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Adicionar Item
              </button>
            </div>
            
            <table class="table" style="margin-bottom: var(--space-4);">
              <thead>
                <tr>
                  <th style="width: 40px;"></th>
                  <th>Item</th>
                  <th style="width: 150px;">Tipo</th>
                  <th style="width: 150px;">Qtd (Volumes)</th>
                  <th style="width: 60px;">Ações</th>
                </tr>
              </thead>
              <tbody id="tf-items-tbody">
              </tbody>
            </table>
            
            <div id="tf-empty-state" style="text-align: center; padding: var(--space-6); color: var(--color-text-secondary); border: 1px dashed var(--color-border); border-radius: var(--radius-md); margin-top: var(--space-2);">
              Nenhum item adicionado à transferência.
            </div>

          </form>
        </div>
        
        <div style="padding: var(--space-4); border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: var(--space-3); background: var(--color-surface-alt);">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('transf-modal-container').innerHTML = ''">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-save-transf">Salvar Transferência</button>
        </div>

      </div>
    </div>
  `;
  
  initTransferenciaForm(isEdit, transf);
}

async function initTransferenciaForm(isEdit, transf) {
  const overlay = document.getElementById('tf-loading-overlay');
  overlay.style.display = 'flex';
  
  await fetchExpedicaoItems();
  
  document.getElementById('btn-add-tf-item').addEventListener('click', () => {
    addTransferenciaItemRow();
  });
  
  document.getElementById('btn-save-transf').addEventListener('click', async () => {
    const editId = isEdit && transf ? transf.id : null;
    await saveTransferencia(isEdit, editId);
  });
  
  if (isEdit && transf) {
    if (transf.previsao_carga) {
      const date = new Date(transf.previsao_carga);
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
      document.getElementById('tf-previsao').value = localISOTime;
    }
    document.getElementById('tf-transportadora').value = transf.transportadora || '';
    document.getElementById('tf-placa').value = transf.placa || '';
    document.getElementById('tf-motorista').value = transf.motorista || '';
    document.getElementById('tf-local-partida').value = transf.local_partida || '';
    document.getElementById('tf-local-destino').value = transf.local_destino || '';
    
    if (transf.expedicao_ordens_carregamento_itens && transf.expedicao_ordens_carregamento_itens.length > 0) {
      transf.expedicao_ordens_carregamento_itens.forEach(item => {
        addTransferenciaItemRow(item);
      });
      document.getElementById('tf-empty-state').style.display = 'none';
    } else {
      addTransferenciaItemRow();
    }
  } else {
    // New
    const date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
    document.getElementById('tf-previsao').value = localISOTime;
    addTransferenciaItemRow();
  }
  
  overlay.style.display = 'none';
}

function addTransferenciaItemRow(existingItem = null) {
  const tbody = document.getElementById('tf-items-tbody');
  document.getElementById('tf-empty-state').style.display = 'none';
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="text-align: center; color: var(--color-text-secondary);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></td>
    <td>
      <select class="form-select tf-item-select" style="width: 100%;" required>
        <option value="">Selecione o Item...</option>
        ${expedicaoItemsCache.map(i => {
          const display = i.ForeignName || i.ItemName;
          return `<option value="${i.ItemCode}" data-name="${display}">${i.ItemCode} - ${display}</option>`;
        }).join('')}
      </select>
    </td>
    <td>
      <select class="form-select tf-tipo-select" style="width: 100%;" required>
        <option value="Obrigatório" ${existingItem && existingItem.tipo === 'Obrigatório' ? 'selected' : ''}>Obrigatório</option>
        <option value="Complementar" ${existingItem && existingItem.tipo === 'Complementar' ? 'selected' : ''}>Complementar</option>
      </select>
    </td>
    <td>
      <input type="number" class="form-input tf-qtd-prog" placeholder="Ex: 40" value="${existingItem ? existingItem.quantidade_programada || '' : ''}" step="any" required>
    </td>
    <td style="text-align: center;">
      <button type="button" class="btn btn-sm btn-icon btn-remove-tf-item" title="Remover" style="color: var(--color-danger);">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </td>
  `;
  
  if (existingItem) {
    tr.querySelector('.tf-item-select').value = existingItem.item_code;
  }
  
  tr.querySelector('.btn-remove-tf-item').addEventListener('click', () => {
    tr.remove();
    if (tbody.children.length === 0) {
      document.getElementById('tf-empty-state').style.display = 'block';
    }
  });
  
  tbody.appendChild(tr);
  return tr;
}

async function saveTransferencia(isEdit, editId) {
  const previsao = document.getElementById('tf-previsao').value;
  const localPartida = document.getElementById('tf-local-partida').value;
  const localDestino = document.getElementById('tf-local-destino').value;
  
  if (!previsao || !localPartida || !localDestino) {
    showToast('Data Prevista, Local de Partida e Local de Destino são obrigatórios.', 'error');
    return;
  }
  
  const tbody = document.getElementById('tf-items-tbody');
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) {
    showToast('Adicione pelo menos um item à transferência.', 'error');
    return;
  }
  
  const itens = [];
  for (const tr of rows) {
    const itemSelect = tr.querySelector('.tf-item-select');
    const itemCode = itemSelect.value;
    const itemName = itemSelect.selectedOptions[0] ? itemSelect.selectedOptions[0].dataset.name : '';
    const tipo = tr.querySelector('.tf-tipo-select').value;
    const qtdProg = tr.querySelector('.tf-qtd-prog').value;
    
    if (!itemCode) {
      showToast('Selecione um item em todas as linhas.', 'error');
      return;
    }
    
    if (tipo === 'Obrigatório' && !qtdProg) {
      showToast('A Quantidade é obrigatória nos itens do tipo Obrigatório.', 'error');
      return;
    }
    
    itens.push({
      item_code: itemCode,
      item_name: itemName,
      tipo: tipo,
      quantidade_programada: tipo === 'Obrigatório' ? (parseFloat(qtdProg.replace(',', '.')) || 0) : null
    });
  }
  
  try {
    const btnSave = document.getElementById('btn-save-transf');
    btnSave.disabled = true;
    btnSave.textContent = 'Salvando...';
    
    const headerData = {
      bplid: getBPLID(),
      tipo: 'transferencia_interna',
      previsao_carga: new Date(previsao).toISOString(),
      transportadora: document.getElementById('tf-transportadora').value || null,
      placa: document.getElementById('tf-placa').value || null,
      motorista: document.getElementById('tf-motorista').value || null,
      local_partida: localPartida,
      local_destino: localDestino
    };
    
    if (isEdit) {
      const { error: headerError } = await supabase.from('expedicao_ordens_carregamento').update(headerData).eq('id', editId);
      if (headerError) throw headerError;
      
      const { error: delError } = await supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', editId);
      if (delError) throw delError;
      
      if (itens.length > 0) {
        const itensPayload = itens.map(i => ({ ...i, ordem_id: editId }));
        const { error: insError } = await supabase.from('expedicao_ordens_carregamento_itens').insert(itensPayload);
        if (insError) throw insError;
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
    
    showToast(isEdit ? 'Transferência atualizada!' : 'Transferência criada com sucesso!', 'success');
    document.getElementById('transf-modal-container').innerHTML = '';
    await fetchRemessas();
    window.dispatchEvent(new Event('expedicao_changed'));
  } catch (err) {
    console.error('Error saving transf', err);
    showToast('Erro ao salvar transferência.', 'error');
    document.getElementById('btn-save-transf').disabled = false;
    document.getElementById('btn-save-transf').textContent = 'Salvar Transferência';
  }
}
