import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { hasModuleAccess } from '../utils/permissions.js';
import { supabase } from '../config/supabase.js';
import { getBPLID } from '../auth/auth.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

let activeMainTab = sessionStorage.getItem('logisticaActiveMainTab') || 'cadastros'; // 'cadastros', 'painel'
let activeSubTab = sessionStorage.getItem('logisticaActiveSubTab') || 'empresas'; // 'empresas', 'placas', 'motoristas'
let dataCache = {
  empresas: [],
  placas: [],
  reboques: [],
  motoristas: []
};

export async function renderLogistica(container = document.getElementById('view-logistica') || document.getElementById('app')) {
  const canCreate = hasModuleAccess('logistica', 'can_create');
  
  container.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Logística', 'Módulos')}
        <div class="page-content" style="padding-top: var(--space-4);">
          
          <!-- Primary Level 1 Navigation Tabs -->
          <div class="logistica-primary-tabs" style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: 0;">
            <button class="logistica-main-tab-btn ${activeMainTab === 'cadastros' ? 'active' : ''}" data-tab="cadastros" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'cadastros' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'cadastros' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'cadastros' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'cadastros' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Cadastros de Transportes
            </button>
            <button class="logistica-main-tab-btn ${activeMainTab === 'painel' ? 'active' : ''}" data-tab="painel" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'painel' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'painel' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'painel' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'painel' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Painel Logístico (Em Breve)
            </button>
          </div>

          <!-- Secondary Navigation Tabs -->
          ${activeMainTab === 'cadastros' ? `
            <div class="logistica-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              <button class="logistica-sub-tab-btn ${activeSubTab === 'empresas' ? 'active' : ''}" data-subtab="empresas" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'empresas' ? '600' : '400'}; color: ${activeSubTab === 'empresas' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'empresas' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Empresas (Transportadoras)
              </button>
              <button class="logistica-sub-tab-btn ${activeSubTab === 'placas' ? 'active' : ''}" data-subtab="placas" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'placas' ? '600' : '400'}; color: ${activeSubTab === 'placas' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'placas' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Placas (Veículos)
              </button>
              <button class="logistica-sub-tab-btn ${activeSubTab === 'reboques' ? 'active' : ''}" data-subtab="reboques" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'reboques' ? '600' : '400'}; color: ${activeSubTab === 'reboques' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'reboques' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Placas (Reboques)
              </button>
              <button class="logistica-sub-tab-btn ${activeSubTab === 'motoristas' ? 'active' : ''}" data-subtab="motoristas" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'motoristas' ? '600' : '400'}; color: ${activeSubTab === 'motoristas' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'motoristas' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Motoristas
              </button>
            </div>
          ` : ''}

          <!-- Tab Content -->
          <div id="logistica-tab-content">
            ${activeMainTab === 'cadastros' ? `
              <div class="toolbar" style="margin-bottom: var(--space-4);">
                <div class="toolbar-left">
                  <h2 id="cadastro-title" style="font-size: var(--font-size-xl); margin: 0;">${activeSubTab === 'empresas' ? 'Empresas' : activeSubTab === 'placas' ? 'Placas (Veículos)' : activeSubTab === 'reboques' ? 'Placas (Reboques)' : 'Motoristas'}</h2>
                </div>
                  <div class="toolbar-right">
                    ${activeSubTab === 'empresas' ? `
                    <span style="font-size: var(--font-size-xs); color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
                      <span style="display: inline-block; width: 8px; height: 8px; background: #569650; border-radius: 50%;"></span>
                      Integração Ativa (SAP B1)
                    </span>
                    ` : `
                    <button class="btn btn-primary" id="btn-novo-cadastro" ${canCreate ? '' : 'disabled'}>
                      <span>+</span> Novo Registro
                    </button>
                    `}
                  </div>
              </div>
              
              <div class="card" style="padding: 0; overflow: hidden; min-height: 400px; position: relative;">
                <div id="cadastro-loading" style="display: flex; position: absolute; inset: 0; background: var(--color-surface); z-index: 10; align-items: center; justify-content: center;">
                  <div class="spinner"></div>
                </div>
                <div class="table-wrapper">
                  <table class="table" id="cadastros-table">
                    <thead id="cadastros-thead">
                      <!-- JS injected -->
                    </thead>
                    <tbody id="cadastros-tbody">
                      <!-- JS injected -->
                    </tbody>
                  </table>
                </div>
              </div>
            ` : `
              <div class="empty-state">
                <div class="empty-state-title">Painel Logístico</div>
                <div class="empty-state-desc">Em desenvolvimento...</div>
              </div>
            `}
          </div>
          
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindLogisticaEvents();
  await loadCadastroData();
}

function bindLogisticaEvents() {
  const mainTabBtns = document.querySelectorAll('.logistica-main-tab-btn');
  mainTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeMainTab = e.currentTarget.dataset.tab;
      sessionStorage.setItem('logisticaActiveMainTab', activeMainTab);
      renderLogistica();
    });
  });

  const subTabBtns = document.querySelectorAll('.logistica-sub-tab-btn');
  subTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeSubTab = e.currentTarget.dataset.subtab;
      sessionStorage.setItem('logisticaActiveSubTab', activeSubTab);
      renderLogistica();
    });
  });

  const btnNovo = document.getElementById('btn-novo-cadastro');
  if (btnNovo) {
    btnNovo.addEventListener('click', () => showCadastroModal());
  }
}

async function loadCadastroData() {
  if (activeMainTab !== 'cadastros') return;
  
  const loading = document.getElementById('cadastro-loading');
  if(loading) loading.style.display = 'block';
  
  const bplid = getBPLID();
  
  try {
    // 1. Fetch SAP Empresas (always needed for CNPJ resolution in Placas/Motoristas)
    if (dataCache.empresas.length === 0) {
      const url = "https://tableros.ngrok.app/BusinessPartners?$select=CardCode,CardName,BPFiscalTaxIDCollection&$filter=Properties1 eq 'tYES'";
      const res = await fetch(url, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json', 
          'ngrok-skip-browser-warning': 'true',
          'Prefer': 'odata.maxpagesize=0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const bps = data.value || [];
        const grouped = {};
        for (const bp of bps) {
          const cnpj = bp.BPFiscalTaxIDCollection?.[0]?.TaxId0;
          if (!cnpj) continue;
          if (!grouped[cnpj]) {
            grouped[cnpj] = { cnpj, nome_fantasia: bp.CardName, cardCodes: [] };
          }
          if (!grouped[cnpj].cardCodes.includes(bp.CardCode)) {
            grouped[cnpj].cardCodes.push(bp.CardCode);
          }
        }
        dataCache.empresas = Object.values(grouped).sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia));
      }
    }

    // 2. Fetch Supabase Data
    if (activeSubTab === 'placas') {
      const { data } = await supabase.from('logistica_placas').select('*').contains('filiais_permitidas', [bplid]).order('placa');
      dataCache.placas = data || [];
    } else if (activeSubTab === 'reboques') {
      const { data } = await supabase.from('logistica_reboques').select('*').contains('filiais_permitidas', [bplid]).order('placa');
      dataCache.reboques = data || [];
    } else if (activeSubTab === 'motoristas') {
      const { data } = await supabase.from('logistica_motoristas').select('*').contains('filiais_permitidas', [bplid]).order('nome');
      dataCache.motoristas = data || [];
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados', 'error');
  }

  renderCadastroTable();
  if(loading) loading.style.display = 'none';
}

function renderCadastroTable() {
  const thead = document.getElementById('cadastros-thead');
  const tbody = document.getElementById('cadastros-tbody');
  
  if (activeSubTab === 'empresas') {
    thead.innerHTML = `<tr><th>Nome da Empresa (SAP)</th><th>CNPJ</th><th>Códigos SAP (CardCodes)</th></tr>`;
    tbody.innerHTML = dataCache.empresas.map(e => `
      <tr>
        <td style="font-weight: 500;">${e.nome_fantasia}</td>
        <td style="font-family: monospace;">${e.cnpj}</td>
        <td>
          <div style="display:flex; gap:4px;">
            ${e.cardCodes.map(c => `<span class="badge badge-gray">${c}</span>`).join('')}
          </div>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="3" style="text-align:center; padding:var(--space-6); color:var(--color-text-secondary);">Nenhuma transportadora encontrada no SAP.</td></tr>`;
  } 
  else if (activeSubTab === 'placas') {
    thead.innerHTML = `<tr><th>Placa (UF)</th><th>Transportadora (SAP)</th><th>Rodado/Carroceria</th><th>Tara/Cap. (kg)</th><th>Status</th><th style="width: 80px;"></th></tr>`;
    tbody.innerHTML = dataCache.placas.map(p => {
      const emp = dataCache.empresas.find(e => e.cnpj === p.empresa_cnpj);
      const empName = emp ? emp.nome_fantasia : 'Sem vínculo';
      const mapRodado = { '1': 'Truck', '2': 'Toco', '3': 'Cavalo Mecânico', '4': 'VAN', '5': 'Utilitário', '6': 'Outros' };
      const mapCarroceria = { '0': 'Não aplicável', '1': 'Aberta', '2': 'Fechado Baú', '3': 'Granelera', '4': 'Porta Container', '5': 'Sider' };
      const rName = mapRodado[p.tipo_rodado] || '-';
      const cName = mapCarroceria[p.tipo_carroceria] || '-';
      return `
      <tr>
        <td style="font-weight: 500; font-family: monospace; font-size: 14px;">${p.placa} <span style="color:var(--color-text-secondary); font-size:12px;">(${p.uf || '-'})</span></td>
        <td>${empName}</td>
        <td>${rName} / ${cName}</td>
        <td>${p.tara || '-'} / ${p.capacidade_kg || '-'}</td>
        <td><span class="badge badge-${p.status ? 'green' : 'gray'}">${p.status ? 'Ativo' : 'Inativo'}</span></td>
        <td style="text-align:right;">
           <button class="btn btn-sm btn-ghost btn-edit" data-id="${p.id}" title="Editar" style="padding: 6px;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
           </button>
        </td>
      </tr>
    `;}).join('') || `<tr><td colspan="6" style="text-align:center; padding:var(--space-6); color:var(--color-text-secondary);">Nenhuma placa cadastrada.</td></tr>`;
  }
  else if (activeSubTab === 'reboques') {
    thead.innerHTML = `<tr><th>Placa (UF)</th><th>Transportadora (SAP)</th><th>Carroceria</th><th>Tara/Cap. (kg)</th><th>Status</th><th style="width: 80px;"></th></tr>`;
    tbody.innerHTML = dataCache.reboques.map(p => {
      const emp = dataCache.empresas.find(e => e.cnpj === p.empresa_cnpj);
      const empName = emp ? emp.nome_fantasia : 'Sem vínculo';
      const mapCarroceria = { '0': 'Não aplicável', '1': 'Aberta', '2': 'Fechado Baú', '3': 'Granelera', '4': 'Porta Container', '5': 'Sider' };
      const cName = mapCarroceria[p.tipo_carroceria] || '-';
      return `
      <tr>
        <td style="font-weight: 500; font-family: monospace; font-size: 14px;">${p.placa} <span style="color:var(--color-text-secondary); font-size:12px;">(${p.uf || '-'})</span></td>
        <td>${empName}</td>
        <td>${cName}</td>
        <td>${p.tara || '-'} / ${p.capacidade_kg || '-'}</td>
        <td><span class="badge badge-${p.status ? 'green' : 'gray'}">${p.status ? 'Ativo' : 'Inativo'}</span></td>
        <td style="text-align:right;">
           <button class="btn btn-sm btn-ghost btn-edit" data-id="${p.id}" title="Editar" style="padding: 6px;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
           </button>
        </td>
      </tr>
    `;}).join('') || `<tr><td colspan="6" style="text-align:center; padding:var(--space-6); color:var(--color-text-secondary);">Nenhum reboque cadastrado.</td></tr>`;
  }
  else if (activeSubTab === 'motoristas') {
    thead.innerHTML = `<tr><th>Nome</th><th>Transportadora (SAP)</th><th>CPF</th><th>CNH</th><th>Status</th><th style="width: 80px;"></th></tr>`;
    tbody.innerHTML = dataCache.motoristas.map(m => {
      const emp = dataCache.empresas.find(e => e.cnpj === m.empresa_cnpj);
      const empName = emp ? emp.nome_fantasia : 'Sem vínculo';
      return `
      <tr>
        <td style="font-weight: 500;">${m.nome}</td>
        <td>${empName}</td>
        <td>${m.cpf || '-'}</td>
        <td>${m.cnh || '-'}</td>
        <td><span class="badge badge-${m.status ? 'green' : 'gray'}">${m.status ? 'Ativo' : 'Inativo'}</span></td>
        <td style="text-align:right;">
           <button class="btn btn-sm btn-ghost btn-edit" data-id="${m.id}" title="Editar" style="padding: 6px;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
           </button>
        </td>
      </tr>
    `;}).join('') || `<tr><td colspan="6" style="text-align:center; padding:var(--space-6); color:var(--color-text-secondary);">Nenhum motorista cadastrado.</td></tr>`;
  }
  
  // Bind edits
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      showCadastroModal(e.currentTarget.dataset.id);
    });
  });
}

function showCadastroModal(editId = null) {
  const container = document.getElementById('cadastro-modal-container');
  let obj = null;
  
  if (editId) {
    if(activeSubTab === 'placas') obj = dataCache.placas.find(x => x.id === editId);
    else if(activeSubTab === 'reboques') obj = dataCache.reboques.find(x => x.id === editId);
    else if(activeSubTab === 'motoristas') obj = dataCache.motoristas.find(x => x.id === editId);
  }
  
  const isEdit = !!obj;
  const titleMap = { empresas: 'Empresa', placas: 'Placa (Veículo)', reboques: 'Placa (Reboque)', motoristas: 'Motorista' };
  
  // Generate specific form fields
  let formFields = '';
  
  if (activeSubTab === 'empresas') {
    return; // Read-only from SAP
  } else if (activeSubTab === 'placas') {
    const empOpts = dataCache.empresas.map(e => `<option value="${e.cnpj}" ${obj?.empresa_cnpj === e.cnpj ? 'selected' : ''}>${e.nome_fantasia} (${e.cnpj})</option>`).join('');
    formFields = `
      <div style="display: flex; gap: var(--space-4);">
        <div class="form-group" style="flex: 2;">
          <label class="form-label">Placa <span style="color:var(--color-danger)">*</span></label>
          <input type="text" class="form-input" id="cad-placa" value="${obj?.placa || ''}" style="text-transform: uppercase;" maxlength="7" required>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">UF</label>
          <select class="form-input" id="cad-uf">
            <option value="">--</option>
            ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => `<option value="${uf}" ${obj?.uf === uf ? 'selected' : ''}>${uf}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Renavam</label>
        <input type="text" class="form-input" id="cad-renavam" value="${obj?.renavam || ''}" maxlength="11">
      </div>
      <div class="form-group">
        <label class="form-label">Transportadora (SAP)</label>
        <select class="form-input" id="cad-empresa">
          <option value="">Sem vínculo</option>
          ${empOpts}
        </select>
      </div>
      <div style="display: flex; gap: var(--space-4);">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Tipo de Rodado</label>
          <select class="form-input" id="cad-rodado">
            <option value="">Selecione...</option>
            <option value="1" ${obj?.tipo_rodado === '1' ? 'selected' : ''}>1: Truck</option>
            <option value="2" ${obj?.tipo_rodado === '2' ? 'selected' : ''}>2: Toco</option>
            <option value="3" ${obj?.tipo_rodado === '3' ? 'selected' : ''}>3: Cavalo Mecânico</option>
            <option value="4" ${obj?.tipo_rodado === '4' ? 'selected' : ''}>4: VAN</option>
            <option value="5" ${obj?.tipo_rodado === '5' ? 'selected' : ''}>5: Utilitário</option>
            <option value="6" ${obj?.tipo_rodado === '6' ? 'selected' : ''}>6: Outros</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Tipo de Carroceria</label>
          <select class="form-input" id="cad-carroceria">
            <option value="">Selecione...</option>
            <option value="0" ${obj?.tipo_carroceria === '0' ? 'selected' : ''}>0: Não aplicável</option>
            <option value="1" ${obj?.tipo_carroceria === '1' ? 'selected' : ''}>1: Aberta</option>
            <option value="2" ${obj?.tipo_carroceria === '2' ? 'selected' : ''}>2: Fechado Baú</option>
            <option value="3" ${obj?.tipo_carroceria === '3' ? 'selected' : ''}>3: Granelera</option>
            <option value="4" ${obj?.tipo_carroceria === '4' ? 'selected' : ''}>4: Porta Container</option>
            <option value="5" ${obj?.tipo_carroceria === '5' ? 'selected' : ''}>5: Sider</option>
          </select>
        </div>
      </div>
      <div style="display: flex; gap: var(--space-4);">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Tara (kg)</label>
          <input type="number" class="form-input" id="cad-tara" value="${obj?.tara || ''}">
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Capacidade (kg)</label>
          <input type="number" class="form-input" id="cad-cap" value="${obj?.capacidade_kg || ''}">
        </div>
      </div>
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="checkbox" id="cad-abastece" ${obj?.abastece ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--color-primary);" />
          <span>Abastece na empresa?</span>
        </label>
      </div>
    `;
  } else if (activeSubTab === 'reboques') {
    const empOpts = dataCache.empresas.map(e => `<option value="${e.cnpj}" ${obj?.empresa_cnpj === e.cnpj ? 'selected' : ''}>${e.nome_fantasia} (${e.cnpj})</option>`).join('');
    formFields = `
      <div style="display: flex; gap: var(--space-4);">
        <div class="form-group" style="flex: 2;">
          <label class="form-label">Placa <span style="color:var(--color-danger)">*</span></label>
          <input type="text" class="form-input" id="cad-placa" value="${obj?.placa || ''}" style="text-transform: uppercase;" maxlength="7" required>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">UF</label>
          <select class="form-input" id="cad-uf">
            <option value="">--</option>
            ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => `<option value="${uf}" ${obj?.uf === uf ? 'selected' : ''}>${uf}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Renavam</label>
        <input type="text" class="form-input" id="cad-renavam" value="${obj?.renavam || ''}" maxlength="11">
      </div>
      <div class="form-group">
        <label class="form-label">Transportadora (SAP)</label>
        <select class="form-input" id="cad-empresa">
          <option value="">Sem vínculo</option>
          ${empOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de Carroceria</label>
        <select class="form-input" id="cad-carroceria">
          <option value="">Selecione...</option>
          <option value="0" ${obj?.tipo_carroceria === '0' ? 'selected' : ''}>0: Não aplicável</option>
          <option value="1" ${obj?.tipo_carroceria === '1' ? 'selected' : ''}>1: Aberta</option>
          <option value="2" ${obj?.tipo_carroceria === '2' ? 'selected' : ''}>2: Fechado Baú</option>
          <option value="3" ${obj?.tipo_carroceria === '3' ? 'selected' : ''}>3: Granelera</option>
          <option value="4" ${obj?.tipo_carroceria === '4' ? 'selected' : ''}>4: Porta Container</option>
          <option value="5" ${obj?.tipo_carroceria === '5' ? 'selected' : ''}>5: Sider</option>
        </select>
      </div>
      <div style="display: flex; gap: var(--space-4);">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Tara (kg)</label>
          <input type="number" class="form-input" id="cad-tara" value="${obj?.tara || ''}">
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Capacidade (kg)</label>
          <input type="number" class="form-input" id="cad-cap" value="${obj?.capacidade_kg || ''}">
        </div>
      </div>
    `;
  } else if (activeSubTab === 'motoristas') {
    const empOpts = dataCache.empresas.map(e => `<option value="${e.cnpj}" ${obj?.empresa_cnpj === e.cnpj ? 'selected' : ''}>${e.nome_fantasia} (${e.cnpj})</option>`).join('');
    formFields = `
      <div class="form-group">
        <label class="form-label">Nome Completo <span style="color:var(--color-danger)">*</span></label>
        <input type="text" class="form-input" id="cad-nome" value="${obj?.nome || ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Empresa (Transportadora) <span style="color:var(--color-danger)">*</span></label>
        <select class="form-select" id="cad-empresa" required>
          <option value="">Selecione...</option>
          ${empOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">CPF</label>
        <input type="text" class="form-input" id="cad-cpf" value="${obj?.cpf || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">CNH</label>
        <input type="text" class="form-input" id="cad-cnh" value="${obj?.cnh || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Telefone</label>
        <input type="text" class="form-input" id="cad-tel" value="${obj?.telefone || ''}">
      </div>
    `;
  }

  const bplid = getBPLID();
  const currentFiliais = obj?.filiais_permitidas || [bplid];
    
  const modalBody = `
    <form id="cadastro-form">
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        ${formFields}
        
        <div class="form-group" style="border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 4px;">
           <label class="form-label" style="margin-bottom: 8px; display: block;">Filiais Permitidas <span class="required">*</span></label>
           <div style="display: flex; gap: var(--space-4); margin-bottom: 8px; flex-wrap: wrap;">
             <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer;">
               <input type="checkbox" class="filial-fleet-checkbox" value="1" ${currentFiliais.includes(1) ? 'checked' : ''} /> Tableros PAL (1)
             </label>
             <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer;">
               <input type="checkbox" class="filial-fleet-checkbox" value="3" ${currentFiliais.includes(3) ? 'checked' : ''} /> Tableros OTC (3)
             </label>
             <label style="display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); cursor: pointer;">
               <input type="checkbox" class="filial-fleet-checkbox" value="4" ${currentFiliais.includes(4) ? 'checked' : ''} /> Tableros SFP (4)
             </label>
           </div>
        </div>
        
        <div class="form-group">
           <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
             <input type="checkbox" id="cad-status" ${(!isEdit || obj?.status) ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--color-primary);" />
             <span>Cadastro Ativo</span>
           </label>
        </div>
      </div>
      
      <div style="margin-top: var(--space-5); display: flex; justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-cadastro">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm" id="btn-save-cadastro">Salvar Registro</button>
      </div>
    </form>
  `;

  openModal(`${isEdit ? 'Editar' : 'Novo'} ${titleMap[activeSubTab]}`, modalBody);
  
  document.getElementById('btn-cancel-cadastro').addEventListener('click', closeModal);
  
  document.getElementById('cadastro-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCadastro(isEdit, editId);
  });
}

async function saveCadastro(isEdit, editId) {
  const btn = document.getElementById('btn-save-cadastro');
  btn.disabled = true;
  btn.innerText = 'Salvando...';
  
  let payload = {};
  let tableName = '';
  
  const filiaisCheckboxes = document.querySelectorAll('.filial-fleet-checkbox:checked');
  const filiaisPermitidas = Array.from(filiaisCheckboxes).map(cb => parseInt(cb.value));
  
  if (filiaisPermitidas.length === 0) {
    showToast('Selecione pelo menos uma filial.', 'error');
    btn.disabled = false;
    btn.innerText = 'Salvar Registro';
    return;
  }
  
  payload.filiais_permitidas = filiaisPermitidas;
  
  if (activeSubTab === 'empresas') {
    return; // Read-only from SAP
  } else if (activeSubTab === 'placas') {
    tableName = 'logistica_placas';
    payload.placa = document.getElementById('cad-placa').value.toUpperCase();
    payload.empresa_cnpj = document.getElementById('cad-empresa').value || null;
    payload.uf = document.getElementById('cad-uf').value || null;
    payload.renavam = document.getElementById('cad-renavam').value || null;
    payload.tara = document.getElementById('cad-tara').value || null;
    payload.tipo_rodado = document.getElementById('cad-rodado').value || null;
    payload.tipo_carroceria = document.getElementById('cad-carroceria').value || null;
    payload.capacidade_kg = document.getElementById('cad-cap').value || null;
    payload.abastece = document.getElementById('cad-abastece').checked;
    payload.status = document.getElementById('cad-status').checked;
  } else if (activeSubTab === 'reboques') {
    tableName = 'logistica_reboques';
    payload.placa = document.getElementById('cad-placa').value.toUpperCase();
    payload.empresa_cnpj = document.getElementById('cad-empresa').value || null;
    payload.uf = document.getElementById('cad-uf').value || null;
    payload.renavam = document.getElementById('cad-renavam').value || null;
    payload.tara = document.getElementById('cad-tara').value || null;
    payload.tipo_carroceria = document.getElementById('cad-carroceria').value || null;
    payload.capacidade_kg = document.getElementById('cad-cap').value || null;
    payload.status = document.getElementById('cad-status').checked;
  } else if (activeSubTab === 'motoristas') {
    tableName = 'logistica_motoristas';
    payload.nome = document.getElementById('cad-nome').value;
    payload.empresa_cnpj = document.getElementById('cad-empresa').value || null;
    payload.cpf = document.getElementById('cad-cpf').value;
    payload.cnh = document.getElementById('cad-cnh').value;
    payload.telefone = document.getElementById('cad-tel').value;
    payload.status = document.getElementById('cad-status').checked;
  }
  
  try {
    if (isEdit) {
      payload.updated_at = new Date().toISOString();
      const { error } = await supabase.from(tableName).update(payload).eq('id', editId);
      if(error) throw error;
      showToast('Registro atualizado!', 'success');
    } else {
      const { error } = await supabase.from(tableName).insert([payload]);
      if(error) throw error;
      showToast('Registro criado!', 'success');
    }
    
    closeModal();
    await loadCadastroData();
  } catch(e) {
    console.error(e);
    showToast('Erro ao salvar o registro', 'error');
    btn.disabled = false;
    btn.innerText = 'Salvar Registro';
  }
}
w i n d o w . a d d E v e n t L i s t e n e r ( ' b r a n c h _ c h a n g e d ' ,   ( )   = >   {   d a t a C a c h e . p l a c a s   =   [ ] ;   d a t a C a c h e . r e b o q u e s   =   [ ] ;   d a t a C a c h e . m o t o r i s t a s   =   [ ] ;   i f   ( a c t i v e M a i n T a b   = = =   ' c a d a s t r o s ' )   r e n d e r L o g i s t i c a ( ) ;   } ) ;  
 