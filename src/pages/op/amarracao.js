import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../../components/modal.js';
import { getBPLID } from '../../auth/auth.js';

let amarracaoOps = [];
let sapItemsCache = [];
let pedidosCache = [];
let currentStatusFilter = 'Pendente'; // Default status to show

export async function fetchAmarracaoOps() {
  try {
    let query = supabase
      .from('pcp_op_amarracao')
      .select('*, apontado_pecas, apontado_m3, amarracoes(count)')
      .eq('bpl_id', getBPLID())
      .order('created_at', { ascending: false });

    if (currentStatusFilter !== 'Todas') {
      query = query.eq('status', currentStatusFilter);
    }

    const { data, error } = await query;

    if (error) throw error;
    amarracaoOps = data || [];
  } catch (error) {
    console.error('Error fetching Amarração OPs:', error);
    showToast('Erro ao carregar Ordens de Produção', 'error');
  }
}

export function setAmarracaoStatusFilter(status) {
  currentStatusFilter = status;
}

export function renderAmarracaoView() {
  const tbody = amarracaoOps.length === 0 
    ? `<tr><td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma ordem de produção encontrada.</td></tr>`
    : amarracaoOps.map(op => {
        const pointedPecas = op.apontado_pecas || 0;
        const pointedM3 = op.apontado_m3 || 0;
        const totalPecas = op.qtd_total_chapas || 1; // Fallback to 1
        const totalM3 = op.total_m3 || 0;
        
        const progressPercent = Math.min(100, Math.round((pointedPecas / totalPecas) * 100));
        
        return `
        <tr>
          <td>
            <div style="font-weight: 600; color: var(--color-primary);">${op.codigo_op || '-'}</div>
            <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">PI: ${op.pi_numero || '-'}</div>
          </td>
          <td>${op.cliente_nome || '-'}</td>
          <td><span style="font-size: var(--font-size-xs); font-family: monospace; background: var(--color-surface-alt); padding: 2px 6px; border-radius: 4px;">${op.item_code}</span><br><small style="color: var(--color-text-secondary);">${op.item_name}</small></td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px; width: 150px;">
              <div style="display: flex; justify-content: space-between; font-size: var(--font-size-xs);">
                <span title="Chapas apontadas" style="font-weight: 500;">${pointedPecas} / ${totalPecas} un</span>
                <span style="font-weight: 600; color: var(--color-primary);">${progressPercent}%</span>
              </div>
              <div style="height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden; margin-bottom: 2px;">
                <div style="height: 100%; width: ${progressPercent}%; background: ${progressPercent >= 100 ? 'var(--color-success)' : 'var(--color-primary)'}; border-radius: 3px; transition: width 0.3s ease;"></div>
              </div>
              <div style="font-size: 0.65rem; color: var(--color-text-secondary); display: flex; justify-content: space-between;">
                <span>Vol: ${Number(pointedM3).toFixed(3)} m³</span>
                <span>/ ${Number(totalM3).toFixed(3)} m³</span>
              </div>
            </div>
          </td>
          <td>
            <span class="badge ${op.status === 'Concluída' ? 'badge-success' : op.status === 'Em Produção' ? 'badge-warning' : 'badge-neutral'}">
              ${op.status}
            </span>
          </td>
          <td style="text-align: right;">
            ${(op.status === 'Pendente' || op.status === 'Aberta') && pointedPecas === 0 ? `
              <button class="btn btn-ghost btn-icon btn-delete-op" data-id="${op.id}" title="Excluir OP (Sem apontamentos)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
            ${op.status === 'Pendente' || op.status === 'Aberta' ? `
              <button class="btn btn-ghost btn-icon btn-edit-op" data-id="${op.id}" title="Editar OP">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            ` : ''}
            ${op.status !== 'Concluída' ? `
              <button class="btn btn-ghost btn-icon btn-finish-op" data-id="${op.id}" title="Finalizar OP">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-icon btn-view-op" data-id="${op.id}" title="Visualizar Detalhes">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </td>
        </tr>
      `}).join('');

  return `
    <!-- Search/Filters toolbar -->
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <select id="op-status-filter" class="filter-select" style="font-size: var(--font-size-sm); height: 34px; width: 160px;">
          <option value="Todas" ${currentStatusFilter === 'Todas' ? 'selected' : ''}>Todas as OPs</option>
          <option value="Pendente" ${currentStatusFilter === 'Pendente' ? 'selected' : ''}>Abertas / Pendentes</option>
          <option value="Em Produção" ${currentStatusFilter === 'Em Produção' ? 'selected' : ''}>Em Produção</option>
          <option value="Concluída" ${currentStatusFilter === 'Concluída' ? 'selected' : ''}>Concluídas</option>
        </select>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary btn-sm" id="btn-new-amarracao" style="height: 34px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nova OP de Amarração
        </button>
      </div>
    </div>
    
    <div class="card" style="border-color: var(--color-border); background: var(--color-surface); display: flex; flex-direction: column; padding: 0; overflow: hidden;">
      <div class="table-container" style="flex: 1;">
        <table class="table">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs);">OP</th>
              <th style="font-size: var(--font-size-xs);">Cliente</th>
              <th style="font-size: var(--font-size-xs);">Item (Compensado)</th>
              <th style="font-size: var(--font-size-xs);">Progresso (Apontamentos)</th>
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


export function bindAmarracaoEvents() {
  const btnNew = document.getElementById('btn-new-amarracao');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      showAmarracaoModal();
    });
  }

  const statusFilter = document.getElementById('op-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', async (e) => {
      setAmarracaoStatusFilter(e.target.value);
      await fetchAmarracaoOps();
      window.dispatchEvent(new Event('amarracao_created'));
    });
  }

  document.querySelectorAll('.btn-delete-op').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const confirmed = await confirmDialog('Excluir OP', 'Tem certeza que deseja excluir esta Ordem de Produção? Esta ação é irreversível.');
      if (!confirmed) return;
      
      try {
        const { error } = await supabase.from('pcp_op_amarracao').delete().eq('id', id);
        if (error) throw error;
        showToast('OP Excluída com sucesso', 'success');
        await fetchAmarracaoOps();
        window.dispatchEvent(new Event('amarracao_created'));
      } catch (e) {
        console.error(e);
        showToast('Erro ao excluir OP', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-edit-op').forEach(btn => {
    btn.addEventListener('click', () => {
      showAmarracaoModal(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-finish-op').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const confirmed = await confirmDialog('Finalizar OP', `Tem certeza que deseja finalizar a OP?`);
      if (!confirmed) return;
      
      try {
        const { error } = await supabase.from('pcp_op_amarracao').update({ status: 'Concluída' }).eq('id', id);
        if (error) throw error;
        showToast('OP Finalizada', 'success');
        await fetchAmarracaoOps();
        window.dispatchEvent(new Event('amarracao_created'));
      } catch (e) {
        console.error(e);
        showToast('Erro ao finalizar', 'error');
      }
    });
  });

  document.querySelectorAll('.btn-view-op').forEach(btn => {
    btn.addEventListener('click', () => {
      printAmarracaoOp(btn.dataset.id);
    });
  });
}
async function fetchSAPItems() {
  if (sapItemsCache.length > 0) return sapItemsCache;
  try {
    const url = "/api/Items?$select=ItemCode,ItemName,ForeignName,ItemsGroupCode,SalesFactor1,SalesFactor2,SalesFactor3,SalesFactor4,U_Quality&$filter=ItemsGroupCode eq 106 and Properties1 eq 'tYES'";
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (res.ok) {
      const data = await res.json();
      sapItemsCache = data.value || [];
    }
  } catch(e) { console.error('Error fetching SAP items', e); }
  return sapItemsCache;
}

async function fetchPedidos() {
  if (pedidosCache.length > 0) return pedidosCache;
  try {
    const url = "/api/SQLQueries('ContratoME')/List";
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (res.ok) {
      const data = await res.json();
      pedidosCache = data.value || [];
    }
  } catch(e) { console.error('Error fetching Pedidos', e); }
  return pedidosCache;
}

function showAmarracaoModal(editId = null) {
  const opEdit = editId ? amarracaoOps.find(o => o.id == editId) : null;
  const isEdit = !!opEdit;
  const modalBody = `
    <form id="amarracao-form" class="modal-form" style="font-size: var(--font-size-sm); position: relative;">
      <input type="hidden" id="am-edit-id" value="${editId || ''}" />
      
      <div id="am-loading-overlay" style="position: absolute; top: -20px; left: -20px; right: -20px; bottom: -20px; background: rgba(255,255,255,0.85); z-index: 100; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; padding-top: 150px; border-radius: var(--radius-lg); backdrop-filter: blur(2px);">
        <div class="spinner" style="width: 40px; height: 40px; border-width: 4px; border-color: var(--color-primary); border-right-color: transparent; margin-bottom: var(--space-4);"></div>
        <span style="color: var(--color-text); font-weight: 600; font-size: 1.1rem;">Sincronizando com o SAP...</span>
        <span style="color: var(--color-text-secondary); font-size: 0.9rem; margin-top: 4px;">Isso pode levar alguns segundos.</span>
      </div>
      
      <!-- Seletor de Origem -->
      <div style="background: var(--color-surface-alt); padding: var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-6); border: 1px solid var(--color-border-light);">
        <label class="form-label" style="margin-bottom: var(--space-3);">Origem da Ordem</label>
        <div style="display: flex; gap: var(--space-6);">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="tipo_origem" value="pedido" checked style="accent-color: var(--color-primary);" />
            <span style="font-weight: 500;">Vincular a Pedido SAP</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="tipo_origem" value="manual" style="accent-color: var(--color-primary);" />
            <span style="font-weight: 500;">Criação Manual Livre</span>
          </label>
        </div>
      </div>

      <!-- Bloco 1: Identificação -->
      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); color: var(--color-text);">Identificação e Cliente</h4>
      
      <div class="form-grid-2" style="margin-bottom: var(--space-6);">
        <!-- Modo Pedido -->
        <div class="form-group" id="grp-pedido-select">
          <label class="form-label">Selecionar Pedido <span class="required">*</span></label>
          <select class="form-select" id="am-pedido-select">
            ${pedidosCache.length > 0 
              ? `<option value="">Selecione um pedido pendente...</option>` + pedidosCache.map(p => `<option value="${p.AbsID}">${p["'Numero'"]} - ${p["'NomePN'"]} (${p.ItemCode})</option>`).join('')
              : `<option value="">Aguarde, carregando pedidos do SAP...</option>`}
          </select>
        </div>

        <!-- Modo Manual -->
        <div class="form-group" id="grp-manual-pi" style="display: none;">
          <label class="form-label">Número da PI/Contrato <span class="required">*</span></label>
          <input type="text" class="form-input" id="am-manual-pi" placeholder="Ex: 6942" />
        </div>

        <div class="form-group">
          <label class="form-label">Cliente</label>
          <input type="text" class="form-input" id="am-cliente" readonly style="background: var(--color-surface-alt);" />
        </div>

        <div class="form-group">
          <label class="form-label">Data Limite de Entrega</label>
          <input type="date" class="form-input" id="am-data-entrega" />
        </div>
      </div>

      <!-- Bloco 2: Item e Dimensões -->
      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); color: var(--color-text);">Produto e Dimensões</h4>
      
      <!-- Item Code full width -->
      <div class="form-group" style="margin-bottom: var(--space-4);">
        <label class="form-label">Código do Item <span class="required">*</span></label>
        <select class="form-select" id="am-item-code" disabled>
          ${sapItemsCache.length > 0
            ? `<option value="">Selecione o Item...</option>` + sapItemsCache.map(i => `<option value="${i.ItemCode}">${i.ItemCode} - ${i.ItemName}</option>`).join('')
            : `<option value="">Aguarde, carregando itens do SAP...</option>`}
        </select>
      </div>

      <!-- Item Name full width below it -->
      <div class="form-group" style="margin-bottom: var(--space-6);">
        <label class="form-label">Nome do Item</label>
        <input type="text" class="form-input" id="am-item-name" readonly style="background: var(--color-surface-alt);" />
      </div>

      <div class="form-grid-3" style="margin-bottom: var(--space-6);">
        <div class="form-group">
          <label class="form-label">Espessura (mm) <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-esp" required />
        </div>
        <div class="form-group">
          <label class="form-label">Largura (mm) <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-larg" required />
        </div>
        <div class="form-group">
          <label class="form-label">Comprimento (mm) <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-comp" required />
        </div>
      </div>

      <!-- Bloco 3: Embalagem e Cálculo -->
      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); color: var(--color-text);">Quantidades e Embalagem</h4>
      
      <div class="form-grid-3" style="margin-bottom: var(--space-4);">
        <div class="form-group">
          <label class="form-label">Qtd. de Caixas <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-qtd-caixas" required min="1" value="1" />
        </div>
        <div class="form-group">
          <label class="form-label">Chapas por Caixa <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-chapas-caixa" required min="1" value="1" />
        </div>
        <div class="form-group" style="background: #f0fdf4; padding: var(--space-2); border-radius: var(--radius-md); border: 1px solid #bbf7d0;">
          <label class="form-label" style="color: #166534; font-weight: 600;">Total de Chapas</label>
          <input type="number" class="form-input" id="am-total-chapas" style="background: transparent; border: 1px dashed transparent; font-size: 1.1rem; font-weight: bold; color: #166534; padding: 4px; border-radius: 4px; transition: 0.2s;" onfocus="this.style.borderColor='#166534'" onblur="this.style.borderColor='transparent'" title="Editável: Digite a quantidade para calcular as caixas" />
        </div>
      </div>

      <div class="form-grid-2" style="margin-bottom: var(--space-6);">
        <div class="form-group">
          <label class="form-label">Qtd. Aberta do Pedido (Referência)</label>
          <input type="text" class="form-input" id="am-qtd-planejada" readonly style="background: var(--color-surface-alt);" placeholder="-" />
        </div>
        <div class="form-group" style="background: #f0fdf4; padding: var(--space-2); border-radius: var(--radius-md); border: 1px solid #bbf7d0;">
          <label class="form-label" style="color: #166534; font-weight: 600;">Cálculo Total (m³)</label>
          <input type="number" step="0.001" class="form-input" id="am-total-m3" style="background: transparent; border: 1px dashed transparent; font-size: 1.1rem; font-weight: bold; color: #166534; padding: 4px; border-radius: 4px; transition: 0.2s;" onfocus="this.style.borderColor='#166534'" onblur="this.style.borderColor='transparent'" title="Editável: Digite o m³ para calcular a quantidade de caixas" />
        </div>
      </div>

      <!-- Bloco 4: Estufagem -->
      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); color: var(--color-text);">Estufagem / Contêineres</h4>
      
      <div class="form-grid-2" style="margin-bottom: var(--space-4);">
        <div class="form-group">
          <label class="form-label">Qtd. de Containers <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-qtd-containers" required min="1" value="1" />
        </div>
        <div class="form-group">
          <label class="form-label">Caixas por Container <span class="required">*</span></label>
          <input type="number" class="form-input" id="am-caixas-container" required min="1" value="1" />
        </div>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-4);">
        <label class="form-label">Marcas dos Containers (Adicione uma para cada container)</label>
        <div id="am-marcas-container" style="display: flex; flex-direction: column; gap: var(--space-2);">
          <input type="text" class="form-input marca-input" placeholder="Marca do Container 1" required />
        </div>
      </div>

      <div class="form-group" style="margin-bottom: var(--space-6);">
        <label class="form-label">Observações de Estufagem</label>
        <textarea class="form-input" id="am-obs" rows="2" placeholder="Informações adicionais para a equipe de estufagem..."></textarea>
      </div>

      <!-- Bloco 5: Certificações -->
      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); color: var(--color-text);">Padrão e Certificações</h4>
      
      <div class="form-group" style="margin-bottom: var(--space-4);">
        <label class="form-label">Padrão de Pintura</label>
        <select class="form-select" id="am-pintura">
          <option value="Tableros">Tableros</option>
          <option value="Cliente">Cliente</option>
          <option value="Sem Pintura">Sem Pintura</option>
        </select>
      </div>

      <div class="table-container" style="margin-bottom: var(--space-4);">
        <table class="table" style="font-size: var(--font-size-xs);">
          <thead>
            <tr>
              <th>Selo / Certificação</th>
              <th style="text-align:center;">É Certificado?</th>
              <th style="text-align:center;">Precisa Carimbo?</th>
              <th style="text-align:center;">Pintar Logo na Caixa?</th>
            </tr>
          </thead>
          <tbody id="cert-tbody">
            ${['FSC', 'CE2+', 'CE4', 'UKCA', 'CARB'].map(selo => `
              <tr>
                <td style="font-weight: 500;">${selo}</td>
                <td style="text-align:center;"><input type="checkbox" class="cert-check" data-selo="${selo}" data-type="certificado" ${isEdit && opEdit.certificacoes && opEdit.certificacoes[selo]?.certificado ? 'checked' : ''} style="accent-color: var(--color-primary);" /></td>
                <td style="text-align:center;"><input type="checkbox" class="cert-check" data-selo="${selo}" data-type="carimbo" ${isEdit && opEdit.certificacoes && opEdit.certificacoes[selo]?.carimbo ? 'checked' : ''} style="accent-color: var(--color-primary);" /></td>
                <td style="text-align:center;"><input type="checkbox" class="cert-check" data-selo="${selo}" data-type="logo" ${isEdit && opEdit.certificacoes && opEdit.certificacoes[selo]?.logo ? 'checked' : ''} style="accent-color: var(--color-primary);" /></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bloco 6: Layout do Stencil (Dropzone) -->
      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); margin-top: var(--space-6); color: var(--color-text);">Layout do Stencil / Pintura</h4>
      <div id="am-layout-dropzone" tabindex="0" style="border: 2px dashed var(--color-border); border-radius: var(--radius-md); padding: var(--space-6); text-align: center; cursor: pointer; background: var(--color-surface-alt); position: relative; min-height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden; transition: border-color 0.2s; outline: none;">
        <input type="hidden" id="am-layout-b64" value="${isEdit && opEdit.layout_pintura ? opEdit.layout_pintura : ''}" />
        
        <div id="am-layout-placeholder" style="${isEdit && opEdit.layout_pintura ? 'display:none;' : ''}">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-secondary); margin-bottom: 8px; margin-left: auto; margin-right: auto; display: block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          <div style="font-weight: 500; color: var(--color-text);">Clique aqui e cole (Ctrl+V) a imagem do layout</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary); margin-top: 4px;">Você pode colar prints de tela diretamente aqui</div>
        </div>
        
        <img id="am-layout-preview" src="${isEdit && opEdit.layout_pintura ? opEdit.layout_pintura : ''}" style="max-width: 100%; max-height: 250px; object-fit: contain; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); ${!isEdit || !opEdit.layout_pintura ? 'display:none;' : ''}" />
        
        <button type="button" id="am-layout-clear" class="btn btn-ghost btn-sm btn-icon" style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.9); box-shadow: 0 1px 3px rgba(0,0,0,0.1); ${!isEdit || !opEdit.layout_pintura ? 'display:none;' : ''}" title="Remover imagem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <h4 style="border-bottom: 1px solid var(--color-border); padding-bottom: 8px; margin-bottom: var(--space-4); margin-top: var(--space-6); color: var(--color-text);">Liberação da OP</h4>
      <div style="background: var(--color-surface-alt); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="font-weight: 600; display: block; margin-bottom: 4px;">Liberar para Produção?</span>
          <span style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">Se ativado, esta ordem de produção aparecerá no aplicativo da fábrica.</span>
        </div>
        <label style="position: relative; display: inline-block; width: 48px; height: 24px;">
          <input type="checkbox" id="am-liberar-producao" style="opacity: 0; width: 0; height: 0;" />
          <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 24px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);"></span>
          <span class="slider-knob" style="position: absolute; content: ''; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%;"></span>
        </label>
      </div>
      <style>
        #am-liberar-producao:checked + span { background-color: var(--color-success) !important; }
        #am-liberar-producao:checked + span + .slider-knob { transform: translateX(24px); }
      </style>
    </form>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="btn-save-amarracao">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
      Salvar Ordem
    </button>
  `;

  openModal('Nova OP de Amarração', modalBody, footerHTML, { maxWidth: '800px' });

  document.getElementById('btn-save-amarracao').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const originalText = btn.innerHTML;
    
    // Validação
    const form = document.getElementById('amarracao-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 8px;"></span> Salvando...`;
    btn.disabled = true;
    
    try {
      await saveAmarracaoOp();
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });

  // Assyncronamente busca os dados (se já tiver em cache resolve na hora) e atualiza
  if (sapItemsCache.length === 0 || pedidosCache.length === 0) {
    loadDataAndBindForm(opEdit);
  } else {
    bindFormInteractiveLogic(sapItemsCache, pedidosCache, opEdit);
  }
}

async function loadDataAndBindForm(opEdit = null) {
  const [items, pedidos] = await Promise.all([fetchSAPItems(), fetchPedidos()]);
  
  const selPedido = document.getElementById('am-pedido-select');
  const selItem = document.getElementById('am-item-code');
  
  if (selPedido) {
    const pedidosFiltrados = pedidos.filter(p => {
      const val = p.U_atv_prod !== undefined ? p.U_atv_prod : p["'U_atv_prod'"];
      return val == 1 || val == null;
    });
    selPedido.innerHTML = `<option value="">Selecione um pedido pendente...</option>` + 
      pedidosFiltrados.map(p => `<option value="${p.AbsID}">${p["'Numero'"] || p.Numero} - ${p["'NomePN'"] || p.NomePN} (${p.ItemCode})</option>`).join('');
  }
  
  if (selItem) {
    selItem.innerHTML = `<option value="">Selecione o Item...</option>` + 
      items.map(i => `<option value="${i.ItemCode}">${i.ItemCode} - ${i.ItemName}</option>`).join('');
  }

  bindFormInteractiveLogic(items, pedidos, opEdit);
}

function bindFormInteractiveLogic(items, pedidos, opEdit = null) {
  const loadingOverlay = document.getElementById('am-loading-overlay');
  if (loadingOverlay) loadingOverlay.remove();

  const radioOrigem = document.querySelectorAll('input[name="tipo_origem"]');
  const selPedido = document.getElementById('am-pedido-select');
  const grpPedido = document.getElementById('grp-pedido-select');
  const grpManualPi = document.getElementById('grp-manual-pi');
  const manualPi = document.getElementById('am-manual-pi');
  const cliente = document.getElementById('am-cliente');
  const itemCode = document.getElementById('am-item-code');
  const itemName = document.getElementById('am-item-name');
  const esp = document.getElementById('am-esp');
  const larg = document.getElementById('am-larg');
  const comp = document.getElementById('am-comp');
  const qtdPlanejada = document.getElementById('am-qtd-planejada');
  
  const qtdCaixas = document.getElementById('am-qtd-caixas');
  const chapasCaixa = document.getElementById('am-chapas-caixa');
  const totalChapas = document.getElementById('am-total-chapas');
  const totalM3 = document.getElementById('am-total-m3');

  const qtdContainers = document.getElementById('am-qtd-containers');
  const containerMarcas = document.getElementById('am-marcas-container');

  // Alternar Origem
  radioOrigem.forEach(r => {
    r.addEventListener('change', (e) => {
      const modo = e.target.value;
      if (modo === 'pedido') {
        grpPedido.style.display = 'block';
        grpManualPi.style.display = 'none';
        itemCode.disabled = true; // Desabilita para não sobrescrever pedido acidentalmente
        cliente.readOnly = true;
        // Limpar
        selPedido.value = '';
        cliente.value = '';
        itemCode.value = '';
        itemName.value = '';
        qtdPlanejada.value = '';
      } else {
        grpPedido.style.display = 'none';
        grpManualPi.style.display = 'block';
        itemCode.disabled = false; // Livre para escolher na lista
        cliente.readOnly = false;
        // Limpar
        cliente.value = '';
        itemCode.value = '';
        itemName.value = '';
        qtdPlanejada.value = '-';
      }
    });
  });

  // Seleção de Pedido
  selPedido.addEventListener('change', () => {
    const p = pedidos.find(x => x.AbsID == selPedido.value);
    if (p) {
      cliente.value = p["'NomePN'"] || '';
      
      const plan = p["'QuantidadePlanejada'"] || 0;
      const acum = p["'QuantidadeAcumulada'"] || 0;
      const aberta = Math.max(0, plan - acum);
      qtdPlanejada.value = aberta.toFixed(3) + ' m³';
      
      // Se o ItemCode do pedido não estiver no select, a gente injeta ele dinamicamente
      if (p.ItemCode && !Array.from(itemCode.options).some(opt => opt.value === p.ItemCode)) {
        itemCode.add(new Option(`${p.ItemCode} - ${p.ItemName || 'Item do Pedido'}`, p.ItemCode));
      }
      
      itemCode.value = p.ItemCode || '';
      // Forçar preenchimento do Item
      fillItemDetails(p.ItemCode, p.ItemName);
    }
  });

  // Seleção Manual de Item
  itemCode.addEventListener('change', () => {
    fillItemDetails(itemCode.value);
  });

  function fillItemDetails(code, fallbackName = '') {
    const item = items.find(x => x.ItemCode === code);
    if (item) {
      itemName.value = item.ItemName || fallbackName;
      // As dimensões vêm em metros do SAP, então multiplicamos por 1000 para ficar em mm
      esp.value = (parseFloat(item.SalesFactor3) * 1000) || 0;
      larg.value = (parseFloat(item.SalesFactor2) * 1000) || 0;
      comp.value = (parseFloat(item.SalesFactor1) * 1000) || 0;
      chapasCaixa.value = parseInt(item.SalesFactor4) || 1;
    } else {
      // Caso seja um item que só veio do pedido mas não do SAP (ex: outro grupo)
      itemName.value = fallbackName;
      // Não limpa esp/larg/comp se não achar, deixa o usuário preencher manualmente
    }
    calcTotals();
  }

  // Cálculos Automáticos Diretos (Caixas -> Total Chapas -> m3)
  function calcTotals() {
    const caixas = parseInt(qtdCaixas.value) || 0;
    const chapas = parseInt(chapasCaixa.value) || 0;
    const tChapas = caixas * chapas;
    totalChapas.value = tChapas;

    const e = parseFloat(esp.value) || 0;
    const l = parseFloat(larg.value) || 0;
    const c = parseFloat(comp.value) || 0;

    // Fórmula m3 = (E * L * C * TotalChapas) / 1.000.000.000 (assumindo em mm)
    if (tChapas > 0 && e > 0 && l > 0 && c > 0) {
      const m3 = (e * l * c * tChapas) / 1000000000;
      totalM3.value = m3.toFixed(3);
    } else {
      totalM3.value = 0;
    }
  }

  // Cálculo Reverso via M3 (M3 -> Total Chapas -> Caixas)
  function calcFromM3() {
    const m3 = parseFloat(totalM3.value) || 0;
    const e = parseFloat(esp.value) || 0;
    const l = parseFloat(larg.value) || 0;
    const c = parseFloat(comp.value) || 0;
    const volPorChapa = (e * l * c) / 1000000000;
    
    if (volPorChapa > 0 && m3 > 0) {
      const tChapas = Math.round(m3 / volPorChapa);
      totalChapas.value = tChapas;
      
      const chapas = parseInt(chapasCaixa.value) || 1;
      qtdCaixas.value = Math.ceil(tChapas / chapas);
    }
  }

  // Cálculo Reverso via Total de Chapas (Chapas -> Caixas, m3)
  function calcFromTotalChapas() {
    const tChapas = parseInt(totalChapas.value) || 0;
    const chapas = parseInt(chapasCaixa.value) || 1;
    qtdCaixas.value = Math.ceil(tChapas / chapas);
    
    const e = parseFloat(esp.value) || 0;
    const l = parseFloat(larg.value) || 0;
    const c = parseFloat(comp.value) || 0;
    
    if (tChapas > 0 && e > 0 && l > 0 && c > 0) {
      const m3 = (e * l * c * tChapas) / 1000000000;
      totalM3.value = m3.toFixed(3);
    } else {
      totalM3.value = 0;
    }
  }

  qtdCaixas.addEventListener('input', calcTotals);
  chapasCaixa.addEventListener('input', calcTotals);
  esp.addEventListener('input', calcTotals);
  larg.addEventListener('input', calcTotals);
  comp.addEventListener('input', calcTotals);

  totalM3.addEventListener('change', calcFromM3);
  totalChapas.addEventListener('change', calcFromTotalChapas);

  // Marcas Dinâmicas
  qtdContainers.addEventListener('input', () => {
    const count = parseInt(qtdContainers.value) || 1;
    containerMarcas.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      containerMarcas.innerHTML += `<input type="text" class="form-input marca-input" placeholder="Marca do Container ${i}" required />`;
    }
  });

  if (opEdit) {
    if (opEdit.tipo_origem === 'manual') {
      document.querySelector('input[name="tipo_origem"][value="manual"]').checked = true;
      document.querySelector('input[name="tipo_origem"]').dispatchEvent(new Event('change'));
      document.getElementById('am-manual-pi').value = opEdit.pi_numero || '';
    } else {
      const opts = Array.from(document.getElementById('am-pedido-select').options);
      const match = opts.find(o => o.text.startsWith(opEdit.pi_numero + ' -'));
      if (match) {
        document.getElementById('am-pedido-select').value = match.value;
      }
    }

    document.getElementById('am-cliente').value = opEdit.cliente_nome || '';
    document.getElementById('am-data-entrega').value = opEdit.data_entrega || '';
    
    // Injetar a opção no select de item se ela não existir
    if (opEdit.item_code && !Array.from(itemCode.options).some(opt => opt.value === opEdit.item_code)) {
      itemCode.add(new Option(`${opEdit.item_code} - ${opEdit.item_name || 'Item do Pedido'}`, opEdit.item_code));
    }
    
    document.getElementById('am-item-code').value = opEdit.item_code || '';
    document.getElementById('am-item-name').value = opEdit.item_name || '';
    
    document.getElementById('am-esp').value = opEdit.espessura || '';
    document.getElementById('am-larg').value = opEdit.largura || '';
    document.getElementById('am-comp').value = opEdit.comprimento || '';
    
    document.getElementById('am-qtd-caixas').value = opEdit.qtd_caixas || 1;
    document.getElementById('am-chapas-caixa').value = opEdit.qtd_chapas_caixa || 1;
    document.getElementById('am-total-chapas').value = opEdit.qtd_total_chapas || 1;
    document.getElementById('am-total-m3').value = opEdit.total_m3 || 0;
    
    document.getElementById('am-qtd-containers').value = opEdit.qtd_containers || 1;
    document.getElementById('am-caixas-container').value = opEdit.caixas_por_container || 1;
    
    // Marcas
    const count = parseInt(opEdit.qtd_containers) || 1;
    containerMarcas.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const val = opEdit.marcas_containers && opEdit.marcas_containers[i-1] ? opEdit.marcas_containers[i-1] : '';
      containerMarcas.innerHTML += `<input type="text" class="form-input marca-input" placeholder="Marca do Container ${i}" value="${val}" required />`;
    }
    
    document.getElementById('am-obs').value = opEdit.obs_estufagem || '';
    document.getElementById('am-liberar-producao').checked = !!opEdit.liberada_producao;
    document.getElementById('am-pintura').value = opEdit.padrao_pintura || 'Tableros';
    
    // As certificações já vêm populadas no HTML graças a isEdit, então não precisa refazer, mas garantimos:
    if (opEdit.certificacoes) {
      Object.entries(opEdit.certificacoes).forEach(([selo, conf]) => {
        const chkCert = document.querySelector(`input.cert-check[data-selo="${selo}"][data-type="certificado"]`);
        if (chkCert) chkCert.checked = !!conf.certificado;
        const chkCarimbo = document.querySelector(`input.cert-check[data-selo="${selo}"][data-type="carimbo"]`);
        if (chkCarimbo) chkCarimbo.checked = !!conf.carimbo;
        const chkLogo = document.querySelector(`input.cert-check[data-selo="${selo}"][data-type="logo"]`);
        if (chkLogo) chkLogo.checked = !!conf.logo;
      });
    }
  }

  // --- Dropzone Logic ---
  const dropzone = document.getElementById('am-layout-dropzone');
  const preview = document.getElementById('am-layout-preview');
  const placeholder = document.getElementById('am-layout-placeholder');
  const clearBtn = document.getElementById('am-layout-clear');
  const b64Input = document.getElementById('am-layout-b64');

  function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Por favor, cole apenas imagens.', 'warning');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Compress using Canvas
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; // avoid transparent black backgrounds
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert back to jpeg 80% quality for small size
        const compressedB64 = canvas.toDataURL('image/jpeg', 0.8);
        
        b64Input.value = compressedB64;
        preview.src = compressedB64;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        clearBtn.style.display = 'block';
        dropzone.style.borderColor = 'var(--color-primary)';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  dropzone.addEventListener('paste', (e) => {
    e.preventDefault();
    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        if (e.clipboardData.items[i].type.indexOf('image') !== -1) {
          processImageFile(e.clipboardData.items[i].getAsFile());
          return;
        }
      }
    }
    showToast('Nenhuma imagem encontrada na área de transferência.', 'warning');
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--color-primary)';
    dropzone.style.background = 'var(--color-primary-light)';
  });
  
  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--color-border)';
    dropzone.style.background = 'var(--color-surface-alt)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--color-border)';
    dropzone.style.background = 'var(--color-surface-alt)';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFile(e.dataTransfer.files[0]);
    }
  });

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    b64Input.value = '';
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
    clearBtn.style.display = 'none';
    dropzone.style.borderColor = 'var(--color-border)';
  });
}

async function saveAmarracaoOp() {
  const tipoOrigem = document.querySelector('input[name="tipo_origem"]:checked').value;
  let pi = '';
  if (tipoOrigem === 'pedido') {
    const sel = document.getElementById('am-pedido-select');
    pi = sel.options[sel.selectedIndex].text.split(' -')[0]; 
  } else {
    pi = document.getElementById('am-manual-pi').value;
  }

  const certificacoes = {};
  ['FSC', 'CE2+', 'CE4', 'UKCA', 'CARB'].forEach(selo => {
    certificacoes[selo] = {
      certificado: document.querySelector(`input.cert-check[data-selo="${selo}"][data-type="certificado"]`).checked,
      carimbo: document.querySelector(`input.cert-check[data-selo="${selo}"][data-type="carimbo"]`).checked,
      logo: document.querySelector(`input.cert-check[data-selo="${selo}"][data-type="logo"]`).checked
    };
  });

  const marcasInputs = document.querySelectorAll('.marca-input');
  const marcas = Array.from(marcasInputs).map(inp => inp.value);

  const payload = {
    tipo_origem: tipoOrigem,
    pi_numero: pi,
    cliente_nome: document.getElementById('am-cliente').value.trim(),
    data_entrega: document.getElementById('am-data-entrega').value || null,
    item_code: document.getElementById('am-item-code').value,
    item_name: document.getElementById('am-item-name').value.trim(),
    espessura: parseFloat(document.getElementById('am-esp').value) || 0,
    largura: parseFloat(document.getElementById('am-larg').value) || 0,
    comprimento: parseFloat(document.getElementById('am-comp').value) || 0,
    qtd_caixas: parseInt(document.getElementById('am-qtd-caixas').value) || 0,
    qtd_chapas_caixa: parseInt(document.getElementById('am-chapas-caixa').value) || 0,
    qtd_total_chapas: parseInt(document.getElementById('am-total-chapas').value) || 0,
    total_m3: parseFloat(document.getElementById('am-total-m3').value) || 0,
    qtd_containers: parseInt(document.getElementById('am-qtd-containers').value) || 0,
    caixas_por_container: parseInt(document.getElementById('am-caixas-container').value) || 0,
    marcas_containers: marcas,
    obs_estufagem: document.getElementById('am-obs').value.trim(),
    padrao_pintura: document.getElementById('am-pintura').value,
    layout_pintura: document.getElementById('am-layout-b64').value || null,
    certificacoes: certificacoes,
    status: 'Pendente',
    liberada_producao: document.getElementById('am-liberar-producao').checked
  };

  const editId = document.getElementById('am-edit-id')?.value;

  try {
    if (editId) {
      const { error } = await supabase.from('pcp_op_amarracao').update(payload).eq('id', editId);
      if (error) throw error;
      showToast('OP de Amarração atualizada!', 'success');
    } else {
      const bplId = getBPLID();
      payload.bpl_id = bplId;

      // Generate next codigo_op
      const { data: latestOp } = await supabase
        .from('pcp_op_amarracao')
        .select('codigo_op')
        .eq('bpl_id', bplId)
        .not('codigo_op', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (latestOp && latestOp.length > 0 && latestOp[0].codigo_op) {
        const parts = latestOp[0].codigo_op.split('-');
        if (parts.length === 2) {
          nextNum = parseInt(parts[1], 10) + 1;
        }
      }
      payload.codigo_op = `AM${bplId}-${nextNum}`;

      const { error } = await supabase.from('pcp_op_amarracao').insert([payload]);
      if (error) throw error;
      showToast('OP de Amarração criada com sucesso!', 'success');
    }
    
    closeModal();
    // Refresh table (assuming this triggers a re-render from parent)
    await fetchAmarracaoOps();
    // How to re-render? Since we don't have access to renderPCP here directly, 
    // we can dispatch a custom event or let the user click the tab again.
    // For now, let's just dispatch an event.
    window.dispatchEvent(new Event('amarracao_created'));
  } catch(error) {
    console.error(error);
    showToast('Erro ao criar OP', 'error');
  }
}

function printAmarracaoOp(id) {
  const op = amarracaoOps.find(o => o.id == id);
  if (!op) {
    showToast('OP não encontrada', 'error');
    return;
  }

  // Handle certifications display
  const certs = op.certificacoes || {};
  const certItems = Object.keys(certs).map(selo => {
    const info = certs[selo];
    if (!info.certificado && !info.carimbo && !info.logo) return '';
    return `
      <div class="cert-item">
        <div class="cert-name">${selo}</div>
        <div class="cert-flags">
          ${info.carimbo ? '✔ Carimbo<br>' : ''}
          ${info.logo ? '✔ Pintura Logo' : ''}
        </div>
      </div>
    `;
  }).join('');

  const marcas = (op.marcas_containers || []).map(m => `<span class="marca-badge">${m}</span>`).join('');

  const printHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>OP - ${op.codigo_op}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.76; }
          .no-print { display: none; }
        }
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 10px; color: #111; font-size: 11px; line-height: 1.3; }
        
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
        .logo { max-height: 35px; }
        .title-box { text-align: center; flex: 1; }
        .title-box h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px; }
        .title-box h2 { margin: 2px 0 0; font-size: 13px; font-weight: 500; color: #555; }
        
        .op-box { text-align: right; }
        .op-num { font-size: 22px; font-weight: 700; padding: 4px 12px; border: 2px solid #222; border-radius: 6px; display: inline-block; background: #f9f9f9; }
        
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        
        .section { border: 1.5px solid #ccc; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
        .section-title { background: #eee; padding: 5px 10px; font-weight: 700; border-bottom: 1.5px solid #ccc; font-size: 12px; text-transform: uppercase; color: #333; }
        .section-content { padding: 10px; }
        
        .field { margin-bottom: 8px; }
        .field:last-child { margin-bottom: 0; }
        .field-label { font-size: 10px; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 1px; display: block; }
        .field-value { font-size: 13px; font-weight: 600; }
        
        .dim-box { display: inline-block; background: #e5e7eb; padding: 4px 8px; border-radius: 4px; margin-right: 6px; font-weight: 700; font-size: 14px; border: 1px solid #d1d5db; }
        
        .cert-grid { display: flex; gap: 10px; flex-wrap: wrap; }
        .cert-item { display: flex; flex-direction: column; align-items: center; border: 1px solid #e5e7eb; padding: 6px; border-radius: 6px; min-width: 80px; background: #f9fafb; }
        .cert-name { font-weight: 700; font-size: 13px; margin-bottom: 4px; border-bottom: 1px solid #d1d5db; width: 100%; text-align: center; padding-bottom: 2px; }
        .cert-flags { font-size: 10px; color: #4b5563; text-align: center; line-height: 1.4; }
        
        .marcas-list { display: flex; gap: 6px; flex-wrap: wrap; }
        .marca-badge { background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-weight: 700; border: 1px solid #c7d2fe; font-size: 11px; }
        
        .footer { margin-top: 15px; font-size: 9px; text-align: center; color: #666; border-top: 1px solid #ddd; padding-top: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="/assets/logo-full.png" class="logo" alt="Tableros" onerror="this.style.display='none'">
        <div class="title-box">
          <h1>Ordem de Produção</h1>
          <h2>Setor de Amarração / Estufagem</h2>
        </div>
        <div class="op-box">
          <div class="op-num">${op.codigo_op || 'N/A'}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="section">
          <div class="section-title">Identificação</div>
          <div class="section-content">
            <div class="field">
              <span class="field-label">Cliente</span>
              <span class="field-value" style="font-size: 18px;">${op.cliente_nome || '-'}</span>
            </div>
            <div class="grid-2">
              <div class="field">
                <span class="field-label">Pedido Interno (PI)</span>
                <span class="field-value">${op.pi_numero || '-'}</span>
              </div>
              <div class="field">
                <span class="field-label">Data de Entrega</span>
                <span class="field-value">${op.data_entrega ? new Date(op.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Produto</div>
          <div class="section-content">
            <div class="field">
              <span class="field-label">Descrição (SAP: ${op.item_code})</span>
              <span class="field-value">${op.item_name || '-'}</span>
            </div>
            <div class="field" style="margin-top: 15px;">
              <span class="field-label">Dimensões Finais (mm)</span>
              <div>
                <span class="dim-box">Esp: ${op.espessura}</span>
                <span class="dim-box">Larg: ${op.largura}</span>
                <span class="dim-box">Comp: ${op.comprimento}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-3">
        <div class="section">
          <div class="section-title">Volumes e Quantidades</div>
          <div class="section-content">
            <div class="grid-2">
              <div class="field">
                <span class="field-label">Total Caixas (Fardos)</span>
                <span class="field-value" style="font-size: 20px;">${op.qtd_caixas}</span>
              </div>
              <div class="field">
                <span class="field-label">Chapas por Caixa</span>
                <span class="field-value">${op.qtd_chapas_caixa}</span>
              </div>
              <div class="field">
                <span class="field-label">Total de Chapas</span>
                <span class="field-value">${op.qtd_total_chapas}</span>
              </div>
              <div class="field">
                <span class="field-label">Volume Total (m³)</span>
                <span class="field-value">${Number(op.total_m3).toFixed(3)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section" style="grid-column: span 2;">
          <div class="section-title">Carimbos e Instruções</div>
          <div class="section-content" style="display: flex; gap: 30px;">
            <div style="flex: 1;">
              <div class="field">
                <span class="field-label">Padrão de Pintura</span>
                <span class="field-value" style="color: #b91c1c;">${op.padrao_pintura || 'Nenhum'}</span>
              </div>
              <div class="field" style="margin-top: 15px;">
                <span class="field-label">Certificações Exigidas</span>
                <div class="cert-grid">
                  ${certItems || '<span style="color: #888; font-style: italic;">Nenhuma certificação exigida.</span>'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Logística e Observações</div>
        <div class="section-content">
          <div class="grid-2">
            <div>
              <div class="field">
                <span class="field-label">Quantidade de Containers</span>
                <span class="field-value">${op.qtd_containers} (com ${op.caixas_por_container} caixas/fardos cada)</span>
              </div>
              <div class="field" style="margin-top: 15px;">
                <span class="field-label">Marcas dos Containers</span>
                <div class="marcas-list">
                  ${marcas || '<span style="color: #888; font-style: italic;">Sem marcas.</span>'}
                </div>
              </div>
            </div>
            <div>
              <div class="field">
                <span class="field-label">Observações de Estufagem</span>
                <div style="padding: 10px; background: #fefce8; border: 1px solid #fef08a; border-radius: 6px; min-height: 80px; font-weight: 500;">
                  ${op.obs_estufagem ? op.obs_estufagem.replace(/\\n/g, '<br>') : '<span style="color: #a1a1aa; font-style: italic;">Nenhuma observação.</span>'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      


      ${op.layout_pintura ? `
      <div class="section" style="margin-top: 15px; page-break-inside: avoid;">
        <div class="section-title">Layout do Stencil / Carimbos</div>
        <div class="section-content" style="text-align: center; padding: 10px;">
          <img src="${op.layout_pintura}" style="max-width: 100%; max-height: 280px; object-fit: contain; border: 1px solid #eee; padding: 5px; border-radius: 4px;" alt="Layout de Pintura">
        </div>
      </div>
      ` : ''}
      
      <div class="footer">
        Gerado pelo Portal PCP Tableros em ${new Date().toLocaleString('pt-BR')}
      </div>
      
      <script>
        document.title = "OP_${op.codigo_op || 'Nova'}";
        window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 500); }
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.document.title = "OP_" + (op.codigo_op || "Nova");
  } else {
    showToast('O bloqueador de pop-ups impediu a impressão.', 'warning');
  }
}
