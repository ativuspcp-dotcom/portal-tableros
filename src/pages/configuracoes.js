import { supabase } from '../config/supabase.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { showToast } from '../components/toast.js';

// Estrutura pensada para crescer: um menu principal por módulo (hoje só PCP) e sub-menus dentro
// dele (hoje só Secagem). Adicionar um novo módulo/tela de configuração é só um novo item aqui.
const MAIN_TABS = [
  { slug: 'pcp', label: 'PCP' }
];
const PCP_SUB_TABS = [
  { slug: 'secagem', label: 'Secagem' }
];

const LOCAIS_ESTOQUE = ['CONSUMIR', 'RESSECAR', 'SERRAR'];

let activeMainTab = sessionStorage.getItem('configActiveMainTab') || 'pcp';
let activePcpSubTab = sessionStorage.getItem('configActivePcpSubTab') || 'secagem';
let regrasCubagem = [];

const fmtDim = (v) => Number(v).toFixed(3).replace('.', ',');

export async function renderConfiguracoes(container = document.getElementById('view-configuracoes') || document.getElementById('app')) {
  const app = container;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Configurações', 'Regras e parâmetros usados pelos formulários do app-operacional')}
        <div class="page-content" style="padding-top: var(--space-4);">

          <div class="pcp-primary-tabs" style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: 0;">
            ${MAIN_TABS.map(t => `
              <button class="config-main-tab-btn ${activeMainTab === t.slug ? 'active' : ''}" data-tab="${t.slug}"
                style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-md) var(--radius-md) 0 0; font-weight: var(--font-weight-semibold); border: 1px solid ${activeMainTab === t.slug ? 'var(--color-border)' : 'transparent'}; border-bottom: 1px solid ${activeMainTab === t.slug ? 'var(--color-surface)' : 'transparent'}; color: ${activeMainTab === t.slug ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; background: ${activeMainTab === t.slug ? 'var(--color-surface)' : 'transparent'}; margin-bottom: -1px; font-size: var(--font-size-base); transition: all var(--transition-fast);">
                ${t.label}
              </button>
            `).join('')}
          </div>

          ${activeMainTab === 'pcp' ? `
            <div class="pcp-sub-tabs" style="display: flex; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border-light); padding-bottom: var(--space-2); padding-left: var(--space-2);">
              ${PCP_SUB_TABS.map(t => `
                <button class="config-sub-tab-btn ${activePcpSubTab === t.slug ? 'active' : ''}" data-subtab="${t.slug}"
                  style="font-size: var(--font-size-sm); font-weight: ${activePcpSubTab === t.slug ? '600' : '400'}; color: ${activePcpSubTab === t.slug ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border: none; background: transparent; border-bottom: 2px solid ${activePcpSubTab === t.slug ? 'var(--color-primary)' : 'transparent'}; padding-bottom: 4px; transition: all var(--transition-fast);">
                  ${t.label}
                </button>
              `).join('')}
            </div>
          ` : ''}

          <div id="config-tab-content">
            ${renderActiveTabView()}
          </div>

        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindEvents();

  if (activeMainTab === 'pcp' && activePcpSubTab === 'secagem') {
    await fetchRegrasCubagem();
    document.getElementById('config-tab-content').innerHTML = renderActiveTabView();
  }
}

function renderActiveTabView() {
  if (activeMainTab === 'pcp' && activePcpSubTab === 'secagem') {
    return renderSecagemConfig();
  }
  return '';
}

function bindEvents() {
  document.querySelectorAll('.config-main-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === activeMainTab) return;
      activeMainTab = tab;
      sessionStorage.setItem('configActiveMainTab', activeMainTab);
      renderConfiguracoes();
    });
  });

  document.querySelectorAll('.config-sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.subtab;
      if (sub === activePcpSubTab) return;
      activePcpSubTab = sub;
      sessionStorage.setItem('configActivePcpSubTab', activePcpSubTab);
      renderConfiguracoes();
    });
  });
}

async function fetchRegrasCubagem() {
  try {
    const { data, error } = await supabase
      .from('pcp_secagem_regras_cubagem')
      .select('*')
      .order('secador')
      .order('comprimento_setup')
      .order('largura_setup')
      .order('opcao');

    if (error) throw error;
    regrasCubagem = data || [];
  } catch (error) {
    console.error('Error fetching regras de cubagem:', error);
    showToast('Erro ao carregar regras de cubagem de secagem', 'error');
  }
}

function renderSecagemConfig() {
  // Agrupa por combinação de setup (secador + comprimento + largura) mantendo a ordem já vinda do banco
  const grupos = [];
  regrasCubagem.forEach(r => {
    let grupo = grupos.find(g => g.secador === r.secador && g.comprimento_setup === r.comprimento_setup && g.largura_setup === r.largura_setup);
    if (!grupo) {
      grupo = { secador: r.secador, comprimento_setup: r.comprimento_setup, largura_setup: r.largura_setup, regras: [] };
      grupos.push(grupo);
    }
    grupo.regras.push(r);
  });

  const gruposHtml = grupos.length === 0
    ? `<div class="card" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma regra de cubagem cadastrada.</div>`
    : grupos.map(g => `
      <div class="card" style="padding: 0; overflow: hidden; border-color: var(--color-border); background: var(--color-surface); margin-bottom: var(--space-4);">
        <div style="padding: var(--space-3) var(--space-4); background: var(--color-surface-alt); border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: var(--space-3);">
          <span class="badge" style="background: rgba(86,150,80,0.1); color: var(--color-primary); font-weight: 600;">${g.secador}</span>
          <span style="font-size: var(--font-size-sm); color: var(--color-text);">Comprimento <strong>${fmtDim(g.comprimento_setup)} m</strong> · Largura <strong>${fmtDim(g.largura_setup)} m</strong></span>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="font-size: var(--font-size-xs);">Opção</th>
                <th style="font-size: var(--font-size-xs);">Modo Cubagem</th>
                <th style="font-size: var(--font-size-xs);">Comprimento</th>
                <th style="font-size: var(--font-size-xs);">Largura</th>
                <th style="font-size: var(--font-size-xs); text-align: center;">Desconto</th>
              </tr>
            </thead>
            <tbody>
              ${g.regras.map(r => `
                <tr>
                  <td style="font-weight: 600; color: var(--color-text);">${r.opcao}</td>
                  <td>${r.modo_cubagem}</td>
                  <td style="font-size: var(--font-size-sm);">${r.comprimento_override !== null ? `${fmtDim(r.comprimento_override)} m (fixo)` : '<span style="color: var(--color-text-secondary);">Puxa do Setup</span>'}</td>
                  <td style="font-size: var(--font-size-sm);">${r.largura_override !== null ? `${fmtDim(r.largura_override)} m (fixo)` : '<span style="color: var(--color-text-secondary);">Puxa do Setup</span>'}</td>
                  <td style="text-align: center;">${r.desconto}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');

  return `
    <div style="max-width: 1100px;">
      <div class="card" style="padding: var(--space-4); border-color: var(--color-border); background: var(--color-surface); margin-bottom: var(--space-4);">
        <h4 style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text); margin-bottom: var(--space-2);">Local Estoque (apontamento de secagem)</h4>
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          ${LOCAIS_ESTOQUE.map(o => `<span class="badge" style="background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-text);">${o}</span>`).join('')}
        </div>
      </div>

      <h4 style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-secondary); margin-bottom: var(--space-3); text-transform: uppercase; letter-spacing: 0.5px;">Regras de Cubagem por Setup</h4>
      ${gruposHtml}
    </div>
  `;
}
