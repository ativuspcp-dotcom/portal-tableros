import { supabase } from '../config/supabase.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader } from '../components/header.js';
import { confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { SECADOR_CONFIG } from './op/secagem.js';

// Estrutura pensada para crescer: um menu principal por módulo (hoje só PCP) e sub-menus dentro
// dele (hoje só Secagem). Adicionar um novo módulo/tela de configuração é só um novo item aqui.
const MAIN_TABS = [
  { slug: 'pcp', label: 'PCP' }
];
const PCP_SUB_TABS = [
  { slug: 'secagem', label: 'Secagem' }
];

const LOCAIS_ESTOQUE = ['CONSUMIR', 'RESSECAR', 'SERRAR'];
const MODOS_CUBAGEM = ['PEÇAS', 'ALTURA'];

let activeMainTab = sessionStorage.getItem('configActiveMainTab') || 'pcp';
let activePcpSubTab = sessionStorage.getItem('configActivePcpSubTab') || 'secagem';

let regrasCubagem = [];
let selectedSecador = Object.keys(SECADOR_CONFIG)[0];
let selectedComboKey = null;
let editingId = null;
let regrasCarregadas = false;

const fmtDim = (v) => Number(v).toFixed(3).replace('.', ',');
const fmtInput = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const comboKey = (comprimento, largura) => `${Number(comprimento)}|${Number(largura)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Aceita "1,3" ou "1.3"; vazio vira null (= "Puxa do Setup"); inválido vira NaN. */
function parseDecimal(str) {
  const s = String(str ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

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
  bindTabEvents();

  if (activeMainTab === 'pcp' && activePcpSubTab === 'secagem') {
    await fetchRegrasCubagem();
    refreshView();
  }
}

function renderActiveTabView() {
  if (activeMainTab === 'pcp' && activePcpSubTab === 'secagem') {
    return renderSecagemConfig();
  }
  return '';
}

function refreshView() {
  const content = document.getElementById('config-tab-content');
  if (!content) return;
  content.innerHTML = renderActiveTabView();
  if (activeMainTab === 'pcp' && activePcpSubTab === 'secagem') bindSecagemConfigEvents();
}

function bindTabEvents() {
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
    regrasCarregadas = true;
  } catch (error) {
    console.error('Error fetching regras de cubagem:', error);
    showToast('Erro ao carregar regras de cubagem de secagem', 'error');
  }
}

/** Secadores conhecidos (regras de preenchimento do setup + qualquer um que já tenha regra gravada). */
function secadoresConhecidos() {
  return [...new Set([...Object.keys(SECADOR_CONFIG), ...regrasCubagem.map(r => r.secador)])];
}

/** Medidas de setup válidas do secador (vindas do SECADOR_CONFIG) + medidas que já tenham regra no banco. */
function combosFor(secador) {
  const cfg = SECADOR_CONFIG[secador];
  const map = new Map();
  if (cfg) {
    cfg.comprimentos.forEach(c => cfg.largurasFor(c).forEach(l => map.set(comboKey(c, l), { comprimento: c, largura: l })));
  }
  regrasCubagem.filter(r => r.secador === secador).forEach(r => {
    const key = comboKey(r.comprimento_setup, r.largura_setup);
    if (!map.has(key)) map.set(key, { comprimento: Number(r.comprimento_setup), largura: Number(r.largura_setup) });
  });
  return [...map.entries()].map(([key, v]) => ({
    key,
    ...v,
    count: regrasCubagem.filter(r => r.secador === secador && comboKey(r.comprimento_setup, r.largura_setup) === key).length
  }));
}

const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const ICON_DELETE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-success);"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

const CELL = 'padding: 4px 8px;';
const INPUT_STYLE = 'height: 30px; font-size: var(--font-size-sm); padding: 0 var(--space-2);';

/** Inputs de uma linha (edição ou adição). `prefix` diferencia os ids ("edit" / "new"). */
function rowInputsHtml(prefix, values) {
  return `
    <td style="${CELL}"><input type="text" id="${prefix}-opcao" class="form-input" maxlength="12" placeholder="Ex.: E" value="${esc(values.opcao)}" style="${INPUT_STYLE} width: 90px; text-transform: uppercase;" /></td>
    <td style="${CELL}">
      <select id="${prefix}-modo" class="form-select" style="${INPUT_STYLE} width: 110px;">
        ${MODOS_CUBAGEM.map(m => `<option value="${m}" ${values.modo_cubagem === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </td>
    <td style="${CELL}"><input type="text" id="${prefix}-comp" class="form-input" inputmode="decimal" placeholder="Setup" value="${esc(fmtInput(values.comprimento_override))}" style="${INPUT_STYLE} width: 80px;" /></td>
    <td style="${CELL}"><input type="text" id="${prefix}-larg" class="form-input" inputmode="decimal" placeholder="Setup" value="${esc(fmtInput(values.largura_override))}" style="${INPUT_STYLE} width: 80px;" /></td>
    <td style="${CELL} text-align: center;"><input type="number" id="${prefix}-desc" class="form-input" min="0" max="100" step="1" value="${esc(values.desconto ?? 0)}" style="${INPUT_STYLE} width: 70px; text-align: center;" /></td>
  `;
}

function renderSecagemConfig() {
  if (!regrasCarregadas) {
    return `<div style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">Carregando regras...</div>`;
  }

  const secadores = secadoresConhecidos();
  if (!secadores.includes(selectedSecador)) selectedSecador = secadores[0];

  const combos = combosFor(selectedSecador);
  if (!combos.find(c => c.key === selectedComboKey)) selectedComboKey = combos[0]?.key ?? null;
  const combo = combos.find(c => c.key === selectedComboKey);

  const regras = combo
    ? regrasCubagem.filter(r => r.secador === selectedSecador && comboKey(r.comprimento_setup, r.largura_setup) === combo.key)
    : [];

  const secadorBtns = secadores.map(s => `
    <button type="button" class="btn btn-sm ${s === selectedSecador ? 'btn-primary' : 'btn-secondary'} cfg-secador-btn" data-secador="${esc(s)}">${esc(s)}</button>
  `).join('');

  const comboBtns = combos.map(c => `
    <button type="button" class="btn btn-sm ${c.key === selectedComboKey ? 'btn-primary' : 'btn-secondary'} cfg-combo-btn" data-combo="${c.key}">
      ${fmtDim(c.comprimento)} × ${fmtDim(c.largura)}
      <span style="opacity: 0.75; font-weight: 400; margin-left: 4px;">· ${c.count === 0 ? 'sem regras' : c.count}</span>
    </button>
  `).join('');

  const viewRow = (r) => `
    <tr>
      <td style="${CELL} font-weight: 600; color: var(--color-text);">${esc(r.opcao)}</td>
      <td style="${CELL}"><span class="badge" style="background: var(--color-surface-alt); color: var(--color-text-secondary);">${r.modo_cubagem}</span></td>
      <td style="${CELL} font-size: var(--font-size-sm);">${r.comprimento_override !== null ? `${fmtDim(r.comprimento_override)} m` : '<span style="color: var(--color-text-secondary);">Setup</span>'}</td>
      <td style="${CELL} font-size: var(--font-size-sm);">${r.largura_override !== null ? `${fmtDim(r.largura_override)} m` : '<span style="color: var(--color-text-secondary);">Setup</span>'}</td>
      <td style="${CELL} text-align: center;">${r.desconto}%</td>
      <td style="${CELL} text-align: right; white-space: nowrap;">
        <button class="btn btn-ghost btn-icon cfg-edit" data-id="${r.id}" title="Editar" style="width: 26px; height: 26px;">${ICON_EDIT}</button>
        <button class="btn btn-ghost btn-icon cfg-delete" data-id="${r.id}" data-opcao="${esc(r.opcao)}" title="Excluir" style="width: 26px; height: 26px;">${ICON_DELETE}</button>
      </td>
    </tr>
  `;

  const editRow = (r) => `
    <tr style="background: var(--color-primary-light);">
      ${rowInputsHtml('edit', r)}
      <td style="${CELL} text-align: right; white-space: nowrap;">
        <button class="btn btn-ghost btn-icon cfg-save-edit" data-id="${r.id}" title="Salvar" style="width: 26px; height: 26px;">${ICON_CHECK}</button>
        <button class="btn btn-ghost btn-icon cfg-cancel-edit" title="Cancelar" style="width: 26px; height: 26px;">${ICON_CLOSE}</button>
      </td>
    </tr>
  `;

  const rowsHtml = regras.length === 0
    ? `<tr><td colspan="6" style="padding: var(--space-4); text-align: center; color: var(--color-text-secondary); font-size: var(--font-size-sm);">Nenhuma opção cadastrada para esta medida. Adicione a primeira abaixo.</td></tr>`
    : regras.map(r => (r.id === editingId ? editRow(r) : viewRow(r))).join('');

  return `
    <div style="max-width: 860px;">
      <div class="card" style="padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3); border-color: var(--color-border); background: var(--color-surface); display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); align-items: center;">
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <span style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Secador</span>
          ${secadorBtns}
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
          <span style="font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;" title="Comprimento × Largura do setup ativo">Medida do setup</span>
          ${comboBtns}
        </div>
      </div>

      ${combo ? `
        <div class="card" style="padding: 0; overflow: hidden; border-color: var(--color-border); background: var(--color-surface);">
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Opção</th>
                  <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Modo Cubagem</th>
                  <th style="font-size: var(--font-size-xs); padding: 6px 8px;" title="Vazio = usa o comprimento do setup">Comprimento fixo</th>
                  <th style="font-size: var(--font-size-xs); padding: 6px 8px;" title="Vazio = usa a largura do setup">Largura fixa</th>
                  <th style="font-size: var(--font-size-xs); padding: 6px 8px; text-align: center;">Desconto %</th>
                  <th style="width: 70px; padding: 6px 8px;"></th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr style="background: var(--color-surface-alt); border-top: 2px solid var(--color-border);">
                  ${rowInputsHtml('new', { modo_cubagem: 'PEÇAS', desconto: 0 })}
                  <td style="${CELL} text-align: right;">
                    <button class="btn btn-primary btn-sm" id="cfg-add" style="height: 30px;">Adicionar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p style="font-size: var(--font-size-xs); color: var(--color-text-secondary); margin: var(--space-2) 0 var(--space-4);">
          Comprimento/Largura fixos em branco (<em>Setup</em>) usam a medida do setup ativo no momento do apontamento. As alterações valem na hora para o app-operacional e não mudam apontamentos já feitos.
        </p>
      ` : ''}

      <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--font-size-xs); color: var(--color-text-secondary);">
        <span style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Local Estoque</span>
        ${LOCAIS_ESTOQUE.map(o => `<span class="badge" style="background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-text);">${o}</span>`).join('')}
      </div>
    </div>
  `;
}

/** Lê e valida os inputs de uma linha; devolve null (com toast) se algo estiver errado. */
function readRowForm(prefix) {
  const opcao = document.getElementById(`${prefix}-opcao`).value.trim().toUpperCase();
  const modo = document.getElementById(`${prefix}-modo`).value;
  const comp = parseDecimal(document.getElementById(`${prefix}-comp`).value);
  const larg = parseDecimal(document.getElementById(`${prefix}-larg`).value);
  const desc = Number(document.getElementById(`${prefix}-desc`).value);

  if (!opcao) {
    showToast('Informe o nome da opção.', 'warning');
    return null;
  }
  if (Number.isNaN(comp) || (comp !== null && comp <= 0) || Number.isNaN(larg) || (larg !== null && larg <= 0)) {
    showToast('Comprimento/Largura fixos devem ser números maiores que zero (ou ficar em branco).', 'warning');
    return null;
  }
  if (!Number.isInteger(desc) || desc < 0 || desc > 100) {
    showToast('O desconto deve ser um número inteiro entre 0 e 100.', 'warning');
    return null;
  }

  return { opcao, modo_cubagem: modo, comprimento_override: comp, largura_override: larg, desconto: desc };
}

function bindSecagemConfigEvents() {
  document.querySelectorAll('.cfg-secador-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSecador = btn.dataset.secador;
      selectedComboKey = null;
      editingId = null;
      refreshView();
    });
  });

  document.querySelectorAll('.cfg-combo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedComboKey = btn.dataset.combo;
      editingId = null;
      refreshView();
    });
  });

  document.querySelectorAll('.cfg-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      editingId = btn.dataset.id;
      refreshView();
      document.getElementById('edit-opcao')?.focus();
    });
  });

  document.querySelectorAll('.cfg-cancel-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      editingId = null;
      refreshView();
    });
  });

  document.querySelectorAll('.cfg-save-edit').forEach(btn => {
    btn.addEventListener('click', () => saveEdit(btn.dataset.id));
  });

  document.querySelectorAll('.cfg-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRegra(btn.dataset.id, btn.dataset.opcao));
  });

  document.getElementById('cfg-add')?.addEventListener('click', addRegra);

  // Enter nos campos da linha de adição/edição confirma, igual clicar no botão
  document.querySelectorAll('input[id^="new-"]').forEach(input => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addRegra(); });
  });
  document.querySelectorAll('input[id^="edit-"]').forEach(input => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && editingId) saveEdit(editingId); });
  });
}

function mutationErrorMessage(error) {
  if (error?.code === '23505') return 'Já existe uma opção com esse nome nesta medida.';
  if (error?.code === '42501') return 'Sem permissão para alterar as regras (somente administradores).';
  return 'Erro ao salvar a regra. Tente novamente.';
}

async function addRegra() {
  const combo = combosFor(selectedSecador).find(c => c.key === selectedComboKey);
  if (!combo) return;

  const fields = readRowForm('new');
  if (!fields) return;

  const btn = document.getElementById('cfg-add');
  btn.disabled = true;

  try {
    const { error } = await supabase.from('pcp_secagem_regras_cubagem').insert({
      secador: selectedSecador,
      comprimento_setup: combo.comprimento,
      largura_setup: combo.largura,
      ...fields
    });
    if (error) throw error;

    showToast(`Opção ${fields.opcao} adicionada.`, 'success');
    await fetchRegrasCubagem();
    refreshView();
    document.getElementById('new-opcao')?.focus();
  } catch (error) {
    console.error('Error adding regra de cubagem:', error);
    showToast(mutationErrorMessage(error), 'error');
    btn.disabled = false;
  }
}

async function saveEdit(id) {
  const fields = readRowForm('edit');
  if (!fields) return;

  try {
    const { data, error } = await supabase
      .from('pcp_secagem_regras_cubagem')
      .update(fields)
      .eq('id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      showToast('Sem permissão para alterar as regras (somente administradores).', 'error');
      return;
    }

    showToast(`Opção ${fields.opcao} atualizada.`, 'success');
    editingId = null;
    await fetchRegrasCubagem();
    refreshView();
  } catch (error) {
    console.error('Error updating regra de cubagem:', error);
    showToast(mutationErrorMessage(error), 'error');
  }
}

async function deleteRegra(id, opcao) {
  const confirmed = await confirmDialog(
    'Excluir opção',
    `Excluir a opção <strong>${esc(opcao)}</strong> desta medida? Ela deixa de aparecer no app-operacional; apontamentos já feitos não são afetados.`
  );
  if (!confirmed) return;

  try {
    const { data, error } = await supabase
      .from('pcp_secagem_regras_cubagem')
      .delete()
      .eq('id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      showToast('Sem permissão para excluir regras (somente administradores).', 'error');
      return;
    }

    showToast(`Opção ${opcao} excluída.`, 'success');
    await fetchRegrasCubagem();
    refreshView();
  } catch (error) {
    console.error('Error deleting regra de cubagem:', error);
    showToast('Erro ao excluir a regra. Tente novamente.', 'error');
  }
}
