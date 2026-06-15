import { getBPLID } from '../auth/auth.js';
import { supabase } from '../config/supabase.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { fetchRemessas, fetchLogisticaData, transferenciasCache, empresasCache, placasCache, motoristasCache, getTransferenciasStatusFilter, setTransferenciasStatusFilter, renderExpedicao } from './expedicao.js';
import { printRomaneioReport } from '../components/romaneio-report.js';

let expedicaoItemsCache = [];

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

export function renderTransferenciaInternaTab(canCreate, canEdit, canDelete) {
  let tbody = `<tr><td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma transferência interna encontrada.</td></tr>`;
  
  if (transferenciasCache && transferenciasCache.length > 0) {
    tbody = transferenciasCache.map(t => `
      <tr class="table-row-hover">
        <td style="font-weight: 500;">${t.codigo_oc || '-'}</td>
        <td>${new Date(t.previsao_carga).toLocaleString('pt-BR')}</td>
        <td>${t.local_partida || '-'} &rarr; ${t.local_destino || '-'}</td>
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
          <button class="btn btn-sm btn-icon btn-view-transf" data-id="${t.id}" title="Ver">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
          ` : ''}
          ${canEdit ? `
          <button class="btn btn-sm btn-icon btn-edit-transf" data-id="${t.id}" title="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>` : ''}
          ${canDelete ? `
          <button class="btn btn-sm btn-icon btn-delete-transf" data-id="${t.id}" title="Excluir" style="color: var(--color-danger);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  const currentFilter = getTransferenciasStatusFilter();

  return `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <select id="transf-status-filter" class="filter-select" style="font-size: var(--font-size-sm); height: 34px; width: 160px;">
          <option value="Todas" ${currentFilter === 'Todas' ? 'selected' : ''}>Todas as Transf.</option>
          <option value="Ativa" ${currentFilter === 'Ativa' ? 'selected' : ''}>Ativas</option>
          <option value="Concluída" ${currentFilter === 'Concluída' ? 'selected' : ''}>Concluídas</option>
        </select>
      </div>
      <div class="flex" style="gap: 12px; margin-left: auto;">
        ${canCreate ? `
        <button id="btn-new-transf" class="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nova Transferência
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

export function bindTransferenciaEvents() {
  const filterTransf = document.getElementById('transf-status-filter');
  if (filterTransf) {
    filterTransf.addEventListener('change', async (e) => {
      setTransferenciasStatusFilter(e.target.value);
      await fetchRemessas();
      renderExpedicao();
    });
  }

  const btnNew = document.getElementById('btn-new-transf');
  if (btnNew) {
    btnNew.addEventListener('click', () => showTransferenciaModal());
  }

  document.querySelectorAll('.btn-edit-transf').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showTransferenciaModal(id);
    });
  });

  document.querySelectorAll('.btn-view-transf').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      printRomaneioReport(id);
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
              <div class="form-group">
                <label class="form-label">Data Prevista <span style="color: var(--color-danger);">*</span></label>
                <input type="datetime-local" id="tf-previsao" class="form-input" required>
              </div>
              <div class="form-group">
                <label class="form-label">Transportadora</label>
                <select id="tf-transportadora" class="form-select">
                  <option value="">Selecione...</option>
                  ${empresasCache.map(e => `<option value="${e.nome_fantasia}" data-cnpj="${e.cnpj}" data-cod="${e.card_code}" ${transf && transf.transportadora === e.nome_fantasia ? 'selected' : ''}>${e.nome_fantasia} (${e.cnpj})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Placa do Veículo</label>
                <select id="tf-placa" class="form-select">
                  <option value="">Selecione...</option>
                  ${placasCache.map(p => `<option value="${p.placa}" ${transf && transf.placa === p.placa ? 'selected' : ''}>${p.placa}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Motorista</label>
                <select id="tf-motorista" class="form-select">
                  <option value="">Selecione...</option>
                  ${motoristasCache.map(m => `<option value="${m.nome}" ${transf && transf.motorista === m.nome ? 'selected' : ''}>${m.nome}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Local de Partida <span style="color: var(--color-danger);">*</span></label>
                <select id="tf-local-partida" class="form-select" required>
                  <option value="">Selecione...</option>
                  <option value="PLY">PLY</option>
                  <option value="OSB">OSB</option>
                  <option value="PLUS">PLUS</option>
                </select>
              </div>
              <div class="form-group">
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
                  <th style="width: 150px;">Qtd (m³)</th>
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
  await fetchLogisticaData();

  const selectTransp = document.getElementById('tf-transportadora');
  // Re-populate transportadora after fetch
  selectTransp.innerHTML = '<option value="">Selecione...</option>' + 
    empresasCache.map(e => `<option value="${e.nome_fantasia}" data-cnpj="${e.cnpj}" data-cod="${e.card_code}" ${transf && transf.transportadora === e.nome_fantasia ? 'selected' : ''}>${e.nome_fantasia} (${e.cnpj})</option>`).join('');
  
  document.getElementById('btn-add-tf-item').addEventListener('click', () => {
    addTransferenciaItemRow();
  });
  
  document.getElementById('btn-save-transf').addEventListener('click', async () => {
    const editId = isEdit && transf ? transf.id : null;
    await saveTransferencia(isEdit, editId);
  });
  
  const selectPlaca = document.getElementById('tf-placa');
  const selectMotorista = document.getElementById('tf-motorista');
  selectTransp.addEventListener('change', () => {
    const selectedOption = selectTransp.selectedOptions[0];
    const cod = selectedOption ? selectedOption.dataset.cod : null;
    const cnpj = selectedOption ? selectedOption.dataset.cnpj : null;
    const transpId = empresasCache.find(e => e.card_code === cod || e.cnpj === cnpj)?.id;
    
    let filteredPlacas = placasCache;
    if (transpId) {
      filteredPlacas = placasCache.filter(p => p.empresa_id === transpId);
    }
    selectPlaca.innerHTML = '<option value="">Selecione...</option>' + filteredPlacas.map(p => `<option value="${p.placa}">${p.placa}</option>`).join('');
    
    let filteredMotoristas = motoristasCache;
    if (transpId) {
      filteredMotoristas = motoristasCache.filter(m => m.empresa_id === transpId);
    }
    selectMotorista.innerHTML = '<option value="">Selecione...</option>' + filteredMotoristas.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  });
  
  // Trigger change immediately to set correct filtered state if editing
  if (isEdit && transf && transf.transportadora) {
    const changeEvent = new Event('change');
    selectTransp.dispatchEvent(changeEvent);
    
    // Restore values after the filter wipes them
    selectPlaca.value = transf.placa || '';
    selectMotorista.value = transf.motorista || '';
  }
  
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
    <td style="position: relative;">
      <input type="hidden" class="tf-item-db-id" value="${existingItem ? existingItem.id : ''}" />
      <input type="text" class="form-input tf-item-input" placeholder="Digite para buscar..." autocomplete="off" required style="width: 100%;">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </td>
  `;
  
  if (existingItem) {
    tr.querySelector('.tf-item-input').value = existingItem.item_code + ' - ' + (existingItem.item_name || '');
  }
  
  const selectTipo = tr.querySelector('.tf-tipo-select');
  const inputQtdProg = tr.querySelector('.tf-qtd-prog');

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
  const inputItem = tr.querySelector('.tf-item-input');
  const dropdownItem = document.createElement('div');
  dropdownItem.className = 'tf-item-dropdown';
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
      <div class="tf-dropdown-option" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--color-border-light); font-size: 13px;" data-value="${o.text}">
        ${o.text}
      </div>
    `).join('');
    
    dropdownItem.querySelectorAll('.tf-dropdown-option').forEach(opt => {
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
  
  // Hide on scroll to prevent detached floating
  const modalBody = document.getElementById('transf-modal-container')?.querySelector('.modal-body');
  if (modalBody) {
    modalBody.addEventListener('scroll', () => {
      dropdownItem.style.display = 'none';
    }, { passive: true });
  }

  tr.querySelector('.btn-remove-tf-item').addEventListener('click', () => {
    if (dropdownItem && dropdownItem.parentNode) {
      dropdownItem.parentNode.removeChild(dropdownItem);
    }
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
    const itemInput = tr.querySelector('.tf-item-input').value.trim();
    if (!itemInput) {
      showToast('Selecione um item em todas as linhas.', 'error');
      return;
    }
    
    const parts = itemInput.split(' - ');
    const itemCode = parts[0];
    const itemName = parts.slice(1).join(' - ');
    const tipo = tr.querySelector('.tf-tipo-select').value;
    const qtdProg = tr.querySelector('.tf-qtd-prog').value;
    const dbId = tr.querySelector('.tf-item-db-id').value;
    
    if (!itemCode) {
      showToast('Selecione um item válido em todas as linhas.', 'error');
      return;
    }
    
    if (tipo === 'Obrigatório' && !qtdProg) {
      showToast('A Quantidade é obrigatória nos itens do tipo Obrigatório.', 'error');
      return;
    }
    
    const newItem = {
      pedido_numero: 'TRANSFERENCIA',
      item_code: itemCode,
      item_name: itemName,
      tipo: tipo,
      quantidade_programada: tipo === 'Obrigatório' ? (parseFloat(qtdProg.replace(',', '.')) || 0) : null
    };
    if (dbId) newItem.id = dbId;
    itens.push(newItem);
  }
  
  try {
    const btnSave = document.getElementById('btn-save-transf');
    btnSave.disabled = true;
    btnSave.textContent = 'Salvando...';
    
    const transpSelect = document.getElementById('tf-transportadora');
    const transportadora = transpSelect.value;
    const transportadoraCod = transpSelect.selectedOptions[0]?.dataset?.cod || null;

    const headerData = {
      bplid: getBPLID(),
      tipo: 'transferencia_interna',
      previsao_carga: new Date(previsao).toISOString(),
      transportadora: transportadora || null,
      transportadora_cod: transportadoraCod,
      placa: document.getElementById('tf-placa').value || null,
      motorista: document.getElementById('tf-motorista').value || null,
      local_partida: localPartida,
      local_destino: localDestino,
      liberado_carregamento: true
    };
    
    if (isEdit) {
      const { error: headerError } = await supabase.from('expedicao_ordens_carregamento').update(headerData).eq('id', editId);
      if (headerError) throw headerError;
      
      if (itens.length > 0) {
        const itensPayload = itens.map(i => { const p = { ...i, ordem_id: editId }; if (!p.id) delete p.id; return p; });
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
        // If all items removed
        const { error: delError } = await supabase.from('expedicao_ordens_carregamento_itens').delete().eq('ordem_id', editId);
        if (delError) throw delError;
      }
    } else {
      const { data: ocData, error: ocError } = await supabase.from('expedicao_ordens_carregamento').insert(headerData).select('id').single();
      if (ocError) throw ocError;
      
      if (itens.length > 0) {
        const itensPayload = itens.map(i => { const p = { ...i, ordem_id: ocData.id }; if (!p.id) delete p.id; return p; });
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
    showToast('Erro ao salvar transferência: ' + (err.message || err.toString()), 'error');
    document.getElementById('btn-save-transf').disabled = false;
    document.getElementById('btn-save-transf').textContent = 'Salvar Transferência';
  }
}
