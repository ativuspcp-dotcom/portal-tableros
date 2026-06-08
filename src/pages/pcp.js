import { supabase } from '../config/supabase.js';
import { logActivity, getCachedSession } from '../auth/auth.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { hasModuleAccess } from '../utils/permissions.js';
import { fetchAmarracaoOps, renderAmarracaoView, bindAmarracaoEvents } from './op/amarracao.js';
import { fetchEstoqueCompAcabado, renderEstoqueCompAcabadoView, renderEstoqueDashboard, bindEstoqueCompAcabadoEvents } from './estoque/comp-acabado.js';
import { fetchAmarracoesProducao, renderAmarracoesProducaoView, bindAmarracoesProducaoEvents } from './producao/amarracoes.js';

window.addEventListener('amarracao_created', () => {
  if (activeMainTab === 'op' && activeOpSubTab === 'amarracao') {
    renderPCP();
  }
});

window.addEventListener('amarracoes_producao_changed', () => {
  if (activeMainTab === 'producao' && activeSubTab === 'amarracoes') {
    renderPCP();
  }
});

// State
let activeMainTab = sessionStorage.getItem('pcpActiveMainTab') || 'producao'; // 'cadastro', 'estrutura', 'op', 'mrp', 'estoque', 'producao'
let activeSubTab = sessionStorage.getItem('pcpActiveSubTab') || 'amarracoes'; // 'lamina_verde', 'lamina_seca', 'compensado_inacabado', 'compensado_acabado', 'estoque_comp_acabado', 'amarracoes'
let activeOpSubTab = sessionStorage.getItem('pcpActiveOpSubTab') || 'laminacao'; 
let items = [];
let filteredItems = [];
let currentItem = null; // null for new, {id, ...} for edit

// Predefined Options
const CLASSES = ['CAPA V', 'ENCHIMENTO V', 'MIOLO V'];
const ESPECIES = ['PINUS', 'EUCA', 'EUCA GRANDIS', 'EUCA DUNNI'];
const QUALIDADES = ['DURA', 'MOLE', 'L', 'G'];

const OP_SECTORS = [
  { slug: 'laminacao', label: 'Laminação' },
  { slug: 'secagem', label: 'Secagem' },
  { slug: 'serra', label: 'Serra' },
  { slug: 'metriguard', label: 'Metriguard' },
  { slug: 'plugadeira', label: 'Plugadeira' },
  { slug: 'juntadeira', label: 'Juntadeira' },
  { slug: 'colagem', label: 'Colagem' },
  { slug: 'prensa', label: 'Prensa' },
  { slug: 'esquadrejadeira', label: 'Esquadrejadeira' },
  { slug: 'lixadeira', label: 'Lixadeira' },
  { slug: 'calibradeira', label: 'Calibradeira' },
  { slug: 'fresadeira', label: 'Fresadeira' },
  { slug: 'amarracao', label: 'Amarração' }
];

/**
 * Render the PCP page structure
 */
export async function renderPCP(container = document.getElementById('view-pcp') || document.getElementById('app')) {
  const app = container;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('PCP', 'Planejamento e Controle de Produção')}
        <div class="page-content" style="padding-top: var(--space-4);">
          
          <!-- Primary Level 1 Navigation Tabs -->
          <div class="pcp-primary-tabs" style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: 0;">
            <button class="pcp-main-tab-btn ${activeMainTab === 'cadastro' ? 'active' : ''}" data-tab="cadastro" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'cadastro' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'cadastro' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'cadastro' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'cadastro' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Cadastro de Itens
            </button>
            <button class="pcp-main-tab-btn ${activeMainTab === 'estrutura' ? 'active' : ''}" data-tab="estrutura" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'estrutura' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'estrutura' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'estrutura' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'estrutura' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Estruturas (BOM)
            </button>
            <button class="pcp-main-tab-btn ${activeMainTab === 'op' ? 'active' : ''}" data-tab="op" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'op' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'op' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'op' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'op' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Ordens de Produção (OP)
            </button>
            <button class="pcp-main-tab-btn ${activeMainTab === 'producao' ? 'active' : ''}" data-tab="producao" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'producao' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'producao' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'producao' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'producao' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Produção
            </button>
            <button class="pcp-main-tab-btn ${activeMainTab === 'mrp' ? 'active' : ''}" data-tab="mrp" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'mrp' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'mrp' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'mrp' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'mrp' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Necessidades (MRP)
            </button>
            <button class="pcp-main-tab-btn ${activeMainTab === 'estoque' ? 'active' : ''}" data-tab="estoque" 
              style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === 'estoque' ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === 'estoque' ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === 'estoque' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === 'estoque' ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
              Estoques
            </button>
          </div>

          <!-- Secondary Navigation Tabs -->
          ${activeMainTab === 'cadastro' ? `
            <div class="pcp-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              <button class="pcp-sub-tab-btn ${activeSubTab === 'lamina_verde' ? 'active' : ''}" data-subtab="lamina_verde" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'lamina_verde' ? '600' : '400'}; color: ${activeSubTab === 'lamina_verde' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'lamina_verde' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Lâminas Verdes
              </button>
              <button class="pcp-sub-tab-btn ${activeSubTab === 'lamina_seca' ? 'active' : ''}" data-subtab="lamina_seca" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'lamina_seca' ? '600' : '400'}; color: ${activeSubTab === 'lamina_seca' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'lamina_seca' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Lâminas Secas
              </button>
              <button class="pcp-sub-tab-btn ${activeSubTab === 'compensado_inacabado' ? 'active' : ''}" data-subtab="compensado_inacabado" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'compensado_inacabado' ? '600' : '400'}; color: ${activeSubTab === 'compensado_inacabado' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'compensado_inacabado' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Compensados Inacabados
              </button>
              <button class="pcp-sub-tab-btn ${activeSubTab === 'compensado_acabado' ? 'active' : ''}" data-subtab="compensado_acabado" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'compensado_acabado' ? '600' : '400'}; color: ${activeSubTab === 'compensado_acabado' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'compensado_acabado' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Compensados Acabados
              </button>
            </div>
          ` : activeMainTab === 'producao' ? `
            <div class="pcp-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              <button class="pcp-sub-tab-btn ${activeSubTab === 'amarracoes' || !activeSubTab.startsWith('estoque_') && activeSubTab !== 'lamina_verde' && activeSubTab !== 'lamina_seca' && activeSubTab !== 'compensado_inacabado' && activeSubTab !== 'compensado_acabado' ? 'active' : ''}" data-subtab="amarracoes" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'amarracoes' || !activeSubTab.startsWith('estoque_') && activeSubTab !== 'lamina_verde' && activeSubTab !== 'lamina_seca' && activeSubTab !== 'compensado_inacabado' && activeSubTab !== 'compensado_acabado' ? '600' : '400'}; color: ${activeSubTab === 'amarracoes' || !activeSubTab.startsWith('estoque_') && activeSubTab !== 'lamina_verde' && activeSubTab !== 'lamina_seca' && activeSubTab !== 'compensado_inacabado' && activeSubTab !== 'compensado_acabado' ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'amarracoes' || !activeSubTab.startsWith('estoque_') && activeSubTab !== 'lamina_verde' && activeSubTab !== 'lamina_seca' && activeSubTab !== 'compensado_inacabado' && activeSubTab !== 'compensado_acabado' ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Amarração
              </button>
            </div>
          ` : activeMainTab === 'op' ? `
            <div class="pcp-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2); overflow-x: auto; white-space: nowrap;">
              ${OP_SECTORS.map(s => `
                <button class="pcp-op-sub-tab-btn ${activeOpSubTab === s.slug ? 'active' : ''}" data-subtab="${s.slug}" 
                  style="font-size: var(--font-size-sm); font-weight: ${activeOpSubTab === s.slug ? '600' : '400'}; color: ${activeOpSubTab === s.slug ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeOpSubTab === s.slug ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                  ${s.label}
                </button>
              `).join('')}
            </div>
          ` : activeMainTab === 'estoque' ? `
            <div class="pcp-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              <button class="pcp-sub-tab-btn ${activeSubTab === 'estoque_comp_acabado' || !activeSubTab.startsWith('estoque_') ? 'active' : ''}" data-subtab="estoque_comp_acabado" 
                style="font-size: var(--font-size-sm); font-weight: ${activeSubTab === 'estoque_comp_acabado' || !activeSubTab.startsWith('estoque_') ? '600' : '400'}; color: ${activeSubTab === 'estoque_comp_acabado' || !activeSubTab.startsWith('estoque_') ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activeSubTab === 'estoque_comp_acabado' || !activeSubTab.startsWith('estoque_') ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                Comp. Acabado
              </button>
            </div>
          ` : ''}

          <!-- Tab Content Area -->
          <div id="pcp-tab-content">
            ${renderActiveTabView()}
          </div>

        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindPCPEvents();

  if (activeMainTab === 'cadastro' && activeSubTab === 'lamina_verde') {
    fetchGreenVeneerItems();
  } else if (activeMainTab === 'cadastro' && activeSubTab === 'compensado_acabado') {
    fetchCompensadosAcabadosSAP();
  } else if (activeMainTab === 'op' && activeOpSubTab === 'amarracao') {
    // Renderiza view vazia/loading primeiro
    document.getElementById('pcp-tab-content').innerHTML = renderActiveTabView();
    bindAmarracaoEvents();
    
    // Busca os dados e atualiza a view silenciosamente
    fetchAmarracaoOps().then(() => {
      if (activeMainTab === 'op' && activeOpSubTab === 'amarracao') {
        document.getElementById('pcp-tab-content').innerHTML = renderActiveTabView();
        bindAmarracaoEvents();
      }
    });
  } else if (activeMainTab === 'estoque' && (activeSubTab === 'estoque_comp_acabado' || !activeSubTab.startsWith('estoque_'))) {
    document.getElementById('pcp-tab-content').innerHTML = renderActiveTabView();
    fetchEstoqueCompAcabado().then(() => {
      if (activeMainTab === 'estoque') {
        // Só chama renderDashboard se a view correta estiver ativa
        renderEstoqueDashboard();
      }
    });
  } else if (activeMainTab === 'producao' && (activeSubTab === 'amarracoes' || !activeSubTab.startsWith('estoque_'))) {
    document.getElementById('pcp-tab-content').innerHTML = renderActiveTabView();
    bindAmarracoesProducaoEvents();
    
    fetchAmarracoesProducao().then(() => {
      if (activeMainTab === 'producao') {
        document.getElementById('pcp-tab-content').innerHTML = renderActiveTabView();
        bindAmarracoesProducaoEvents();
      }
    });
  }
}

/**
 * Render active view based on main/subtab combination
 */
function renderActiveTabView() {
  // If in estoque tab
  if (activeMainTab === 'estoque') {
    return renderEstoqueCompAcabadoView();
  }
  
  if (activeMainTab === 'producao') {
    if (activeSubTab === 'amarracoes' || (!activeSubTab.startsWith('estoque_') && activeSubTab !== 'lamina_verde' && activeSubTab !== 'lamina_seca' && activeSubTab !== 'compensado_inacabado' && activeSubTab !== 'compensado_acabado')) {
      return renderAmarracoesProducaoView();
    }
  }

  // If not in items registration tab
  if (activeMainTab !== 'cadastro') {
    let title = '';
    let description = '';
    
    if (activeMainTab === 'estrutura') {
      title = 'Estrutura de Produtos (BOM)';
      description = 'Gestão de fichas técnicas, insumos e receitas de colagem e montagem de painéis.';
    } else if (activeMainTab === 'op') {
      const sector = OP_SECTORS.find(s => s.slug === activeOpSubTab);
      title = sector ? sector.label : 'Ordens de Produção';
      description = 'Acompanhamento do status de fabricação, balanceamento de linhas e apontamentos para ' + (sector ? sector.label : 'este setor') + '.';
    } else if (activeMainTab === 'mrp') {
      title = 'Planejamento de Necessidades (MRP)';
      description = 'Cálculo de explosão de demandas de matéria-prima e ordens sugeridas com base nas vendas e estoques.';
    }

    if (activeMainTab === 'op' && activeOpSubTab === 'amarracao') {
      return renderAmarracaoView();
    }

    return `
      <div class="card" style="text-align: center; padding: var(--space-12); border-color: var(--color-border); background: var(--color-surface);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2); color: var(--color-text);">${title}</h3>
        <p style="color: var(--color-text-secondary); max-width: 460px; margin: 0 auto; font-size: var(--font-size-sm);">${description}</p>
      </div>
    `;
  }

  // Under items registration, check sub-tabs
  if (activeSubTab === 'lamina_seca' || activeSubTab === 'compensado_inacabado') {
    let subTitle = activeSubTab === 'lamina_seca' ? 'Lâminas Secas' : 'Compensados Inacabados';

    return `
      <div class="card" style="text-align: center; padding: var(--space-12); border-color: var(--color-border); background: var(--color-surface);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2); color: var(--color-text);">${subTitle}</h3>
        <p style="color: var(--color-text-secondary); max-width: 460px; margin: 0 auto; font-size: var(--font-size-sm);">Gestão de cadastro e dimensões de engenharia para ${subTitle.toLowerCase()} em desenvolvimento.</p>
      </div>
    `;
  }

  if (activeSubTab === 'compensado_acabado') {
    return `
      <!-- Search/Filters toolbar -->
      <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
        <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
          <div class="search-bar" style="max-width: 260px; flex: 1;">
            <span class="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input type="text" id="fc-search" placeholder="Pesquisar por item ou descrição..." style="font-size: var(--font-size-sm);" />
          </div>
        </div>
        <div class="toolbar-right">
          <span style="font-size: var(--font-size-xs); color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: #569650; border-radius: 50%;"></span>
            Integração Ativa (SAP B1)
          </span>
        </div>
      </div>

      <!-- Items Table -->
      <div class="card" style="padding: 0; overflow: hidden; border-color: var(--color-border); background: var(--color-surface);">
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th style="font-size: var(--font-size-xs);">Cód. Item</th>
                <th style="font-size: var(--font-size-xs);">Descrição (ItemName)</th>
                <th style="font-size: var(--font-size-xs);">Descrição Estrangeira</th>
                <th style="font-size: var(--font-size-xs);">Qualidade</th>
                <th style="font-size: var(--font-size-xs);">Dimensões (C x L)</th>
                <th style="font-size: var(--font-size-xs);">Bitola/Espessura</th>
                <th style="font-size: var(--font-size-xs);">Peças/Fardo</th>
              </tr>
            </thead>
            <tbody id="fc-table-body" style="font-size: var(--font-size-sm);">
              <tr>
                <td colspan="6" style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
                  Carregando registros do SAP B1...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Active Lâminas Verdes registration view
  const canCreate = hasModuleAccess('pcp', 'can_create');

  return `
    <!-- Search/Filters toolbar -->
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1;">
        <div class="search-bar" style="max-width: 260px; flex: 1;">
          <span class="search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </span>
          <input type="text" id="pcp-search" placeholder="Pesquisar por item ou ID..." style="font-size: var(--font-size-sm);" />
        </div>
        <select class="filter-select" id="filter-classe" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todas as Classes</option>
          ${CLASSES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-especie" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todas as Espécies</option>
          ${ESPECIES.map(e => `<option value="${e}">${e}</option>`).join('')}
        </select>
        <select class="filter-select" id="filter-qualidade" style="font-size: var(--font-size-sm); height: 34px;">
          <option value="">Todas as Qualidades</option>
          ${QUALIDADES.map(q => `<option value="${q}">${q}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-right">
        ${canCreate ? `
          <button class="btn btn-primary btn-sm" id="btn-new-item">
            Novo Item
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Items Table -->
    <div class="card" style="padding: 0; overflow: hidden; border-color: var(--color-border); background: var(--color-surface);">
      <div class="table-wrapper" style="max-height: 60vh; overflow-y: auto;">
        <table class="table">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs);">ID</th>
              <th style="font-size: var(--font-size-xs);">Cód. SAP</th>
              <th style="font-size: var(--font-size-xs);">Item / Descrição Técnica</th>
              <th style="font-size: var(--font-size-xs);">Dimensões (C x L)</th>
              <th style="font-size: var(--font-size-xs);">Bitola</th>
              <th style="font-size: var(--font-size-xs);">Classe</th>
              <th style="font-size: var(--font-size-xs);">Espécie</th>
              <th style="font-size: var(--font-size-xs);">Qualidade</th>
              <th style="font-size: var(--font-size-xs);">Empilhamento</th>
              <th style="font-size: var(--font-size-xs);">Volume Pacote</th>
              <th style="font-size: var(--font-size-xs);">Integrações</th>
              <th style="width: 80px; text-align: center; font-size: var(--font-size-xs);">Ações</th>
            </tr>
          </thead>
          <tbody id="pcp-table-body" style="font-size: var(--font-size-sm);">
            <tr>
              <td colspan="12" style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
                Carregando registros...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/// Events
function bindPCPEvents() {
  // Main tabs
  document.querySelectorAll('.pcp-main-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.dataset.tab;
      if (targetTab !== activeMainTab) {
        activeMainTab = targetTab;
        if (activeMainTab === 'cadastro') activeSubTab = 'lamina_verde';
        if (activeMainTab === 'estoque') activeSubTab = 'estoque_comp_acabado';
        if (activeMainTab === 'producao') activeSubTab = 'amarracoes';
        
        sessionStorage.setItem('pcpActiveMainTab', activeMainTab);
        sessionStorage.setItem('pcpActiveSubTab', activeSubTab);
        renderPCP();
      }
    });
  });

  // Sub level 2 tabs
  const subTabs = document.querySelectorAll('.pcp-sub-tab-btn');
  if (subTabs) {
    subTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.dataset.subtab;
        if (activeSubTab === sub) return;
        activeSubTab = sub;
        sessionStorage.setItem('pcpActiveSubTab', activeSubTab);
        renderPCP();
      });
    });
  }

  // OP Sub level 2 tabs
  const opSubTabs = document.querySelectorAll('.pcp-op-sub-tab-btn');
  if (opSubTabs) {
    opSubTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.dataset.subtab;
        if (activeOpSubTab === sub) return;
        activeOpSubTab = sub;
        sessionStorage.setItem('pcpActiveOpSubTab', activeOpSubTab);
        renderPCP();
      });
    });
  }

  if (activeMainTab !== 'cadastro') return;

  if (activeSubTab === 'lamina_verde') {
    // Filters
    const searchInput = document.getElementById('pcp-search');
    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    ['filter-classe', 'filter-especie', 'filter-qualidade'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', applyFilters);
      }
    });

    // Create button
    const newBtn = document.getElementById('btn-new-item');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        currentItem = null;
        showPCPModal();
      });
    }
  } else if (activeSubTab === 'compensado_acabado') {
    const searchInput = document.getElementById('fc-search');
    if (searchInput) {
      searchInput.addEventListener('input', applyFiltersSAP);
    }
  }
}

let sapItems = [];
let sapFilteredItems = [];

async function fetchCompensadosAcabadosSAP() {
  try {
    const url = "/api/Items?$select=ItemCode,ItemName,ForeignName,ItemsGroupCode,SalesFactor1,SalesFactor2,SalesFactor3,SalesFactor4,U_Quality&$filter=ItemsGroupCode eq 106 and Properties1 eq 'tYES'&$top=5000";
    const res = await fetch(url, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      sapItems = data.value || [];
      sapFilteredItems = sapItems;
      renderSAPTableData();
    } else {
      console.error('Error fetching SAP items:', res.status, res.statusText);
      showToast('Erro ao buscar dados do SAP B1.', 'error');
      document.getElementById('fc-table-body').innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: red;">Erro ao buscar dados do SAP B1.</td></tr>`;
    }
  } catch (error) {
    console.error('Network error fetching SAP items:', error);
    showToast('Falha na conexão com o SAP B1.', 'error');
    document.getElementById('fc-table-body').innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: red;">Falha na conexão com o SAP B1.</td></tr>`;
  }
}

function applyFiltersSAP() {
  const query = (document.getElementById('fc-search')?.value || '').trim().toLowerCase();
  if (!query) {
    sapFilteredItems = sapItems;
  } else {
    sapFilteredItems = sapItems.filter(item => 
      (item.ItemCode && item.ItemCode.toLowerCase().includes(query)) ||
      (item.ItemName && item.ItemName.toLowerCase().includes(query)) ||
      (item.ForeignName && item.ForeignName.toLowerCase().includes(query))
    );
  }
  renderSAPTableData();
}

function renderSAPTableData() {
  const tbody = document.getElementById('fc-table-body');
  if (!tbody) return;

  if (sapFilteredItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
          Nenhum registro encontrado.
        </td>
      </tr>
    `;
    return;
  }

  const qualityMap = {
    '001': '1ª QUALIDADE',
    '002': '1ª PERMUTA',
    '003': '2ª QUALIDADE',
    '004': '3ª QUALIDADE',
    '005': 'BG',
    '006': 'SG'
  };

  tbody.innerHTML = sapFilteredItems.map(item => {
    const comp = item.SalesFactor1 || '-';
    const larg = item.SalesFactor2 || '-';
    const dims = comp !== '-' && larg !== '-' ? `${comp} x ${larg}` : '-';
    const qual = qualityMap[item.U_Quality] || item.U_Quality || '-';
    
    return `
      <tr>
        <td style="font-family: monospace; font-weight: var(--font-weight-semibold); color: var(--color-text);">${item.ItemCode}</td>
        <td style="font-weight: var(--font-weight-medium); color: var(--color-text);">${item.ItemName || '-'}</td>
        <td style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${item.ForeignName || '-'}</td>
        <td><span class="badge" style="background: var(--color-surface-alt); color: var(--color-text-secondary);">${qual}</span></td>
        <td>${dims}</td>
        <td><span style="font-weight: var(--font-weight-semibold); color: var(--color-text);">${item.SalesFactor3 || '-'}</span></td>
        <td style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${item.SalesFactor4 || '-'}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Load veneers from database
 */
async function fetchGreenVeneerItems() {
  // Supabase local table dropped in favor of SAP B1 integration
  items = [];
  applyFilters();
}

/**
 * Perform filters
 */
function applyFilters() {
  if (activeMainTab !== 'cadastro' || activeSubTab !== 'lamina_verde') return;

  const query = (document.getElementById('pcp-search')?.value || '').trim().toLowerCase();
  const classFilter = document.getElementById('filter-classe')?.value || '';
  const speciesFilter = document.getElementById('filter-especie')?.value || '';
  const qualityFilter = document.getElementById('filter-qualidade')?.value || '';

  filteredItems = items.filter(item => {
    const matchesText = !query || 
      item.id.toLowerCase().includes(query) || 
      (item.cod_sap && item.cod_sap.toLowerCase().includes(query)) ||
      item.item.toLowerCase().includes(query);

    const matchesClass = !classFilter || item.classe === classFilter;
    const matchesSpecies = !speciesFilter || item.especie === speciesFilter;
    const matchesQuality = !qualityFilter || item.qualidade === qualityFilter;

    return matchesText && matchesClass && matchesSpecies && matchesQuality;
  });

  renderTableData();
}

/**
 * Render green veneers items rows
 */
function renderTableData() {
  const tbody = document.getElementById('pcp-table-body');
  if (!tbody) return;

  if (filteredItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">
          Nenhum registro encontrado.
        </td>
      </tr>
    `;
    return;
  }

  const canEdit = hasModuleAccess('pcp', 'can_edit');
  const canDelete = hasModuleAccess('pcp', 'can_delete');

  tbody.innerHTML = filteredItems.map(item => {
    const dims = `${item.comp.toFixed(2)} x ${item.larg.toFixed(2)} m`;
    const bitola = `${item.bitola.toFixed(1)} mm`;
    const volPeca = `${item.peca.toFixed(6)} m³`;
    
    let empilhamento = '';
    if (item.padrao_altura_pecas === 'PEÇAS') {
      empilhamento = `${item.padrao_pacote} pçs`;
    } else {
      empilhamento = `${item.padrao_pacote.toFixed(2)} m ${item.padrao_desconto > 0 ? `(-${item.padrao_desconto}%)` : ''}`;
    }

    const volPacote = `${item.padrao_total.toFixed(3)} m³`;

    // Normalizing status integration badge style
    const oTCBadge = item.sit_otc === 'ATIVO' ? 'badge-green' : 'badge-gray';
    const pALBadge = item.sit_pal === 'ATIVO' ? 'badge-green' : 'badge-gray';
    const sFPBadge = item.sit_sfp === 'ATIVO' ? 'badge-green' : 'badge-gray';

    return `
      <tr>
        <td style="font-family: monospace; font-weight: var(--font-weight-semibold); color: var(--color-text);">${item.id}</td>
        <td style="font-family: monospace; color: var(--color-text-secondary); font-size: var(--font-size-xs);">${item.cod_sap || '-'}</td>
        <td>
          <div style="font-weight: var(--font-weight-medium); color: var(--color-text);">${item.item}</div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">Vol. Peça: ${volPeca} | Área: ${item.altura.toFixed(2)} m²</div>
        </td>
        <td>${dims}</td>
        <td><span style="font-weight: var(--font-weight-semibold); color: var(--color-text);">${bitola}</span></td>
        <td><span class="badge" style="background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-text);">${item.classe}</span></td>
        <td><span class="badge" style="background: rgba(86,150,80,0.06); color: var(--color-primary);">${item.especie}</span></td>
        <td><span class="badge" style="background: var(--color-surface-alt); color: var(--color-text-secondary);">${item.qualidade}</span></td>
        <td style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${empilhamento}</td>
        <td style="font-weight: var(--font-weight-semibold); color: var(--color-primary);">${volPacote}</td>
        <td>
          <div style="display: flex; gap: 2px;">
            <span class="badge ${oTCBadge}" style="font-size: 9px; padding: 1px 4px;">OTC</span>
            <span class="badge ${pALBadge}" style="font-size: 9px; padding: 1px 4px;">PAL</span>
            <span class="badge ${sFPBadge}" style="font-size: 9px; padding: 1px 4px;">SFP</span>
          </div>
        </td>
        <td>
          <div style="display: flex; justify-content: center; gap: var(--space-1);">
            ${canEdit ? `
              <button class="btn btn-secondary btn-sm btn-icon btn-edit-item" data-id="${item.id}" title="Editar" style="width: 26px; height: 26px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            ` : ''}
            ${canDelete ? `
              <button class="btn btn-danger btn-sm btn-icon btn-delete-item" data-id="${item.id}" title="Excluir" style="width: 26px; height: 26px; background: transparent; border: 1px solid var(--color-border); color: var(--color-danger);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Bind edit/delete
  document.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      currentItem = items.find(i => i.id === id);
      showPCPModal();
    });
  });

  document.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      handleDeleteItem(id);
    });
  });
}

/**
 * Delete a product
 */
async function handleDeleteItem(id) {
  const confirmed = await confirmDialog(
    'Confirmar Exclusão',
    `Deseja excluir a lâmina verde ${id}? Esta operação não pode ser desfeita.`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from('pcp_lamina_verde')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logActivity('Excluiu Lâmina Verde', 'pcp', { id });
    showToast(`Registro ${id} excluído.`, 'success');
    await fetchGreenVeneerItems();
  } catch (error) {
    console.error('Error deleting green veneer:', error);
    showToast('Erro ao excluir item.', 'error');
  }
}

/**
 * Open form modal
 */
function showPCPModal() {
  const isEdit = !!currentItem;
  const title = isEdit ? `Editar Lâmina Verde: ${currentItem.id}` : 'Nova Lâmina Verde';

  const modalBody = `
    <form id="pcp-form" class="modal-form" style="padding-right: var(--space-2); font-size: var(--font-size-sm);">
      <div class="form-grid-2">
        
        <!-- ID -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Código do Produto (ID)<span class="required">*</span></label>
          <input type="text" class="form-input" id="form-id" placeholder="LV0001" required ${isEdit ? 'readonly style="background-color: var(--color-border-light); font-family: monospace; height: 36px;"' : 'readonly style="background-color: var(--color-border-light); font-family: monospace; height: 36px;"'} />
        </div>

        <!-- Cód SAP -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Cód. SAP</label>
          <input type="text" class="form-input" id="form-cod-sap" placeholder="Opcional" style="font-family: monospace; height: 36px;" />
        </div>

        <!-- Technical Name -->
        <div class="form-group" style="grid-column: span 2; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px;">
            <label class="form-label" style="font-size: var(--font-size-xs); margin-bottom: 0;">Nome Técnico / Item<span class="required">*</span></label>
            <label class="form-label" style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer; user-select: none; font-size: var(--font-size-xs); margin-bottom: 0;">
              <input type="checkbox" id="form-auto-name" checked style="width: 14px; height: 14px; accent-color: var(--color-primary);" />
              <span>Nome automático</span>
            </label>
          </div>
          <input type="text" class="form-input" id="form-item" placeholder="Gerado automaticamente" required style="height: 36px;" />
        </div>

        <!-- Classe -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Classe<span class="required">*</span></label>
          <select class="form-select" id="form-classe" required style="height: 36px; padding: 0 var(--space-3);">
            <option value="">Selecione...</option>
            ${CLASSES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>

        <!-- Espécie -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Espécie<span class="required">*</span></label>
          <select class="form-select" id="form-especie" required style="height: 36px; padding: 0 var(--space-3);">
            <option value="">Selecione...</option>
            ${ESPECIES.map(e => `<option value="${e}">${e}</option>`).join('')}
          </select>
        </div>

        <!-- Qualidade -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Qualidade<span class="required">*</span></label>
          <select class="form-select" id="form-qualidade" required style="height: 36px; padding: 0 var(--space-3);">
            <option value="">Selecione...</option>
            ${QUALIDADES.map(q => `<option value="${q}">${q}</option>`).join('')}
          </select>
        </div>

        <!-- Bitola (mm) -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Bitola (mm)<span class="required">*</span></label>
          <input type="number" class="form-input" id="form-bitola" placeholder="2.2" step="0.1" min="0.1" required style="height: 36px;" />
        </div>

        <!-- Comprimento (m) -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Comprimento (m)<span class="required">*</span></label>
          <input type="number" class="form-input" id="form-comp" placeholder="2.60" step="0.01" min="0.1" required style="height: 36px;" />
        </div>

        <!-- Largura (m) -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Largura (m)<span class="required">*</span></label>
          <input type="number" class="form-input" id="form-larg" placeholder="1.30" step="0.01" min="0.1" required style="height: 36px;" />
        </div>

        <!-- Colunas -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Colunas Pacote</label>
          <input type="number" class="form-input" id="form-coluna-pacote" value="1" min="1" required style="height: 36px;" />
        </div>

        <!-- Empilhamento -->
        <div class="form-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Empilhamento<span class="required">*</span></label>
          <select class="form-select" id="form-padrao-altura-pecas" required style="height: 36px; padding: 0 var(--space-3);">
            <option value="PEÇAS">Por peças</option>
            <option value="ALTURA">Por altura (m)</option>
          </select>
        </div>

        <!-- Padrão pacote -->
        <div class="form-group">
          <label class="form-label" id="form-padrao-pacote-label" style="font-size: var(--font-size-xs);">Padrão Pacote<span class="required">*</span></label>
          <input type="number" class="form-input" id="form-padrao-pacote" placeholder="220" step="any" min="0.001" required style="height: 36px;" />
        </div>

        <!-- Desconto -->
        <div class="form-group" id="form-desconto-group">
          <label class="form-label" style="font-size: var(--font-size-xs);">Desconto (%)</label>
          <input type="number" class="form-input" id="form-padrao-desconto" placeholder="15" value="0" min="0" max="100" style="height: 36px;" />
        </div>

        <!-- Calculations preview -->
        <div style="grid-column: span 2; background: var(--color-surface-alt); border: 1px solid var(--color-border); padding: var(--space-3); border-radius: var(--radius-md); margin: var(--space-1) 0;">
          <h4 style="font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); color: var(--color-primary); margin-bottom: var(--space-2); display: flex; align-items: center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="9" y1="22" x2="9" y2="16"></line><line x1="8" y1="6" x2="16" y2="6"></line><line x1="16" y1="22" x2="16" y2="16"></line><line x1="9" y1="16" x2="9" y2="12"></line><line x1="16" y1="16" x2="16" y2="12"></line><line x1="9" y1="12" x2="9" y2="8"></line><line x1="16" y1="12" x2="16" y2="8"></line></svg>
            Cálculo Automático (Volume Efetivo)
          </h4>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); font-size: var(--font-size-xs);">
            <div>
              <span style="color: var(--color-text-secondary);">Volume Peça:</span>
              <strong style="display: block; font-size: var(--font-size-sm); color: var(--color-text);" id="preview-peca">0.000000 m³</strong>
            </div>
            <div>
              <span style="color: var(--color-text-secondary);">Área Base:</span>
              <strong style="display: block; font-size: var(--font-size-sm); color: var(--color-text);" id="preview-altura">0.00 m²</strong>
            </div>
            <div>
              <span style="color: var(--color-text-secondary);">M³ Pacote:</span>
              <strong style="display: block; font-size: var(--font-size-sm); color: var(--color-primary);" id="preview-padrao-total">0.000 m³</strong>
            </div>
          </div>
          <div id="preview-formula-expl" style="margin-top: var(--space-2); font-size: 10px; color: var(--color-text-secondary); border-top: 1px solid var(--color-border); padding-top: var(--space-1); font-style: italic;">
            Fórmulas ativas baseadas em bitola e área nominal.
          </div>
        </div>

        <!-- Integrações status toggle grids -->
        <div style="grid-column: span 2; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-top: var(--space-1);">
          <div class="form-group">
            <label class="form-label" style="font-size: var(--font-size-xs);">Situação OTC</label>
            <select class="form-select" id="form-sit-otc" style="height: 36px; padding: 0 var(--space-2);">
              <option value="ATIVO">ATIVO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: var(--font-size-xs);">Situação PAL</label>
            <select class="form-select" id="form-sit-pal" style="height: 36px; padding: 0 var(--space-2);">
              <option value="ATIVO">ATIVO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: var(--font-size-xs);">Situação SFP</label>
            <select class="form-select" id="form-sit-sfp" style="height: 36px; padding: 0 var(--space-2);">
              <option value="ATIVO">ATIVO</option>
              <option value="INATIVO">INATIVO</option>
            </select>
          </div>
        </div>

      </div>

      <div style="margin-top: var(--space-5); display: flex; justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-pcp">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm">Salvar Lâmina</button>
      </div>
    </form>
  `;

  openModal(title, modalBody);

  // Setup form values if editing
  if (isEdit) {
    document.getElementById('form-id').value = currentItem.id;
    document.getElementById('form-cod-sap').value = currentItem.cod_sap || '';
    document.getElementById('form-classe').value = currentItem.classe;
    document.getElementById('form-especie').value = currentItem.especie;
    document.getElementById('form-qualidade').value = currentItem.qualidade;
    document.getElementById('form-bitola').value = currentItem.bitola;
    document.getElementById('form-comp').value = currentItem.comp;
    document.getElementById('form-larg').value = currentItem.larg;
    document.getElementById('form-coluna-pacote').value = currentItem.coluna_pacote;
    document.getElementById('form-padrao-altura-pecas').value = currentItem.padrao_altura_pecas;
    document.getElementById('form-padrao-pacote').value = currentItem.padrao_pacote;
    document.getElementById('form-padrao-desconto').value = currentItem.padrao_desconto;
    document.getElementById('form-sit-otc').value = itemStatusHelper(currentItem.sit_otc);
    document.getElementById('form-sit-pal').value = itemStatusHelper(currentItem.sit_pal);
    document.getElementById('form-sit-sfp').value = itemStatusHelper(currentItem.sit_sfp);
    
    document.getElementById('form-auto-name').checked = false;
    document.getElementById('form-item').value = currentItem.item;
  } else {
    // Auto-generate next ID
    const lvItems = items.filter(i => i.id.startsWith('LV'));
    let maxNum = 0;
    lvItems.forEach(i => {
      const numMatch = i.id.match(/^LV(\d+)$/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    const nextId = `LV${nextNum.toString().padStart(4, '0')}`;
    document.getElementById('form-id').value = nextId;
  }

  // calculations
  bindModalCalculationEvents();

  // Cancel buttons click
  document.getElementById('btn-cancel-pcp').addEventListener('click', closeModal);

  // Form submission
  document.getElementById('pcp-form').addEventListener('submit', handleFormSubmit);
}

// Normalize incoming status from JSON to dropdown
function itemStatusHelper(val) {
  if (!val) return 'ATIVO';
  const v = val.toUpperCase();
  return v === 'ATIVO' || v === 'A' ? 'ATIVO' : 'INATIVO';
}

/**
 * Handle formula and text updating in real time
 */
function bindModalCalculationEvents() {
  const compInput = document.getElementById('form-comp');
  const largInput = document.getElementById('form-larg');
  const bitolaInput = document.getElementById('form-bitola');
  const padraoTypeInput = document.getElementById('form-padrao-altura-pecas');
  const padraoPacoteInput = document.getElementById('form-padrao-pacote');
  const padraoDescontoInput = document.getElementById('form-padrao-desconto');

  const pClass = document.getElementById('form-classe');
  const pSpecies = document.getElementById('form-especie');
  const pQuality = document.getElementById('form-qualidade');

  const autoNameCheck = document.getElementById('form-auto-name');
  const itemInput = document.getElementById('form-item');

  function computeLiveMath() {
    const comp = parseFloat(compInput.value) || 0;
    const larg = parseFloat(largInput.value) || 0;
    const bitola = parseFloat(bitolaInput.value) || 0;
    const padraoType = padraoTypeInput.value;
    const padraoPacote = parseFloat(padraoPacoteInput.value) || 0;
    const padraoDesconto = parseFloat(padraoDescontoInput.value) || 0;

    const peca = comp * larg * (bitola / 1000);
    const altura = comp * larg;

    let padraoTotal = 0;
    let explanation = '';

    if (padraoType === 'PEÇAS') {
      padraoTotal = padraoPacote * peca;
      explanation = `Padrão PEÇAS: Volume = ${padraoPacote} peças × ${peca.toFixed(6)} m³ = ${padraoTotal.toFixed(3)} m³`;
    } else {
      const effectiveHeight = padraoPacote * (1 - padraoDesconto / 100);
      const pieceHeightMeters = bitola / 1000;
      let piecesEstimated = 0;
      if (pieceHeightMeters > 0) {
        piecesEstimated = Math.round(effectiveHeight / pieceHeightMeters);
      }
      padraoTotal = piecesEstimated * peca;
      explanation = `Padrão ALTURA: Alt. Útil = ${effectiveHeight.toFixed(2)}m | Peças = ${piecesEstimated} | Volume = ${padraoTotal.toFixed(3)} m³`;
    }

    document.getElementById('preview-peca').textContent = `${peca.toFixed(6)} m³`;
    document.getElementById('preview-altura').textContent = `${altura.toFixed(2)} m²`;
    document.getElementById('preview-padrao-total').textContent = `${padraoTotal.toFixed(3)} m³`;
    document.getElementById('preview-formula-expl').innerHTML = explanation;

    if (autoNameCheck.checked) {
      const cls = pClass.value || '[Classe]';
      const spc = pSpecies.value || '[Espécie]';
      const qlt = pQuality.value || '[Qualidade]';
      
      const bStr = bitola > 0 ? `${bitola.toFixed(1).replace('.', ',')}MM` : '[Bitola]MM';
      const cStr = comp > 0 ? comp.toFixed(3).replace('.', ',') : '[Comp]';
      const lStr = larg > 0 ? larg.toFixed(3).replace('.', ',') : '[Larg]';

      itemInput.value = `${cls} ${spc} '${qlt}' ${bStr} ${cStr} X ${lStr}`.toUpperCase();
    }
  }

  [compInput, largInput, bitolaInput, padraoTypeInput, padraoPacoteInput, padraoDescontoInput, pClass, pSpecies, pQuality].forEach(el => {
    el.addEventListener('input', computeLiveMath);
    el.addEventListener('change', computeLiveMath);
  });

  autoNameCheck.addEventListener('change', () => {
    itemInput.readOnly = autoNameCheck.checked;
    if (autoNameCheck.checked) {
      computeLiveMath();
    }
  });

  padraoTypeInput.addEventListener('change', () => {
    const isPieces = padraoTypeInput.value === 'PEÇAS';
    document.getElementById('form-padrao-pacote-label').innerHTML = isPieces 
      ? 'Padrão Pacote (Peças)<span class="required">*</span>'
      : 'Padrão Pacote / Altura (m)<span class="required">*</span>';
    
    padraoPacoteInput.placeholder = isPieces ? 'Ex: 220' : 'Ex: 0.60';
    
    const discGroup = document.getElementById('form-desconto-group');
    if (isPieces) {
      discGroup.style.display = 'none';
      padraoDescontoInput.value = 0;
    } else {
      discGroup.style.display = 'flex';
    }
  });

  padraoTypeInput.dispatchEvent(new Event('change'));
  computeLiveMath();
}

/**
 * Save item changes
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('form-id').value.trim().toUpperCase();
  const cod_sap = document.getElementById('form-cod-sap').value.trim();
  const item = document.getElementById('form-item').value.trim().toUpperCase();
  const classe = document.getElementById('form-classe').value;
  const especie = document.getElementById('form-especie').value;
  const qualidade = document.getElementById('form-qualidade').value;
  const bitola = parseFloat(document.getElementById('form-bitola').value);
  const comp = parseFloat(document.getElementById('form-comp').value);
  const larg = parseFloat(document.getElementById('form-larg').value);
  const coluna_pacote = parseInt(document.getElementById('form-coluna-pacote').value) || 1;
  const padrao_altura_pecas = document.getElementById('form-padrao-altura-pecas').value;
  const padrao_pacote = parseFloat(document.getElementById('form-padrao-pacote').value);
  const padrao_desconto = parseFloat(document.getElementById('form-padrao-desconto').value) || 0;
  
  const sit_otc = document.getElementById('form-sit-otc').value;
  const sit_pal = document.getElementById('form-sit-pal').value;
  const sit_sfp = document.getElementById('form-sit-sfp').value;

  const peca = comp * larg * (bitola / 1000);
  const altura = comp * larg;
  
  let padrao_total = 0;
  if (padrao_altura_pecas === 'PEÇAS') {
    padrao_total = padrao_pacote * peca;
  } else {
    const effectiveHeight = padrao_pacote * (1 - padrao_desconto / 100);
    const pieceHeightMeters = bitola / 1000;
    let piecesEstimated = 0;
    if (pieceHeightMeters > 0) {
      piecesEstimated = Math.round(effectiveHeight / pieceHeightMeters);
    }
    padrao_total = piecesEstimated * peca;
  }

  const payload = {
    id,
    cod_sap,
    item,
    classe,
    especie,
    qualidade,
    bitola,
    comp,
    larg,
    coluna_pacote,
    padrao_altura_pecas,
    padrao_pacote,
    padrao_desconto,
    padrao_total,
    peca,
    altura,
    sit_otc,
    sit_pal,
    sit_sfp,
    updated_at: new Date().toISOString()
  };

  const isEdit = !!currentItem;

  try {
    if (isEdit) {
      const { error } = await supabase
        .from('pcp_lamina_verde')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      await logActivity('Editou Lâmina Verde', 'pcp', { id });
      showToast(`Lâmina Verde ${id} atualizada.`, 'success');
    } else {
      const { data: existing } = await supabase
        .from('pcp_lamina_verde')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (existing) {
        showToast(`Código ${id} já cadastrado!`, 'warning');
        return;
      }

      const { error } = await supabase
        .from('pcp_lamina_verde')
        .insert({
          ...payload,
          criado_em: new Date().toISOString()
        });

      if (error) throw error;

      await logActivity('Cadastrou Lâmina Verde', 'pcp', { id });
      showToast(`Lâmina Verde ${id} cadastrada.`, 'success');
    }

    closeModal();
    await fetchGreenVeneerItems();
  } catch (error) {
    console.error('Error saving green veneer:', error);
    showToast('Erro ao salvar lâmina verde.', 'error');
  }
}
