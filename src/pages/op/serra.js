import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { openModal, closeModal } from '../../components/modal.js';
import { getBPLID } from '../../auth/auth.js';
import { hasModuleAccess } from '../../utils/permissions.js';
import { SETUP_OPCOES } from './secagem.js';

// Setup da Serra: uma única serra por filial (tabela pcp_serras). Espécie/bitola/turno são as mesmas
// listas dos secadores (SETUP_OPCOES em op/secagem.js); tipo é só PRODUÇÃO. Comprimento e largura NÃO
// fazem parte do setup: são informados no apontamento. A validação de verdade é da função do banco
// salvar_setup_serra (lista repetida lá e no app-operacional, setup-serra.js).
const TIPOS = ['PRODUÇÃO'];

let temSerra = false;
let serraOps = [];
let filterStatus = 'Ativa';

function fmtBitola(v) {
  return Number(v).toFixed(1).replace('.', ',');
}

export async function fetchSerraOps(forceRefresh = false) {
  try {
    // Sequencial de propósito: não usar Promise.all em várias chamadas supabase.from()
    const { data: serraData, error: serraError } = await supabase
      .from('pcp_serras')
      .select('bpl_id')
      .eq('bpl_id', getBPLID())
      .eq('ativo', true);
    if (serraError) throw serraError;
    temSerra = (serraData || []).length > 0;

    const { data, error } = await supabase
      .from('pcp_op_serra')
      .select('*')
      .eq('bpl_id', getBPLID())
      .order('created_at', { ascending: false });
    if (error) throw error;
    serraOps = data || [];
  } catch (error) {
    console.error('Error fetching Serra OPs:', error);
    showToast('Erro ao carregar Ordens de Produção da Serra', 'error');
  }
}

function getActiveOp() {
  return serraOps.find(op => op.status === 'Ativa') || null;
}

export function renderSerraView() {
  const canActions = hasModuleAccess('pcp', 'can_actions');

  if (!temSerra) {
    return `
      <div class="card" style="text-align: center; padding: var(--space-12); border-color: var(--color-border); background: var(--color-surface);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2); color: var(--color-text);">Serra</h3>
        <p style="color: var(--color-text-secondary); max-width: 460px; margin: 0 auto; font-size: var(--font-size-sm);">Nenhuma serra cadastrada para esta filial.</p>
      </div>
    `;
  }

  const op = getActiveOp();

  const cardHtml = `
    <div class="card serra-card" style="padding: var(--space-4); border-color: var(--color-border); background: var(--color-surface); cursor: ${canActions ? 'pointer' : 'default'}; max-width: 420px; margin-bottom: var(--space-6);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">
        <div>
          <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Setor</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: var(--color-text);">SERRA</div>
        </div>
        <span class="badge ${op ? 'badge-success' : 'badge-neutral'}">${op ? 'ATIVA · ' + op.codigo_op : 'SEM SETUP'}</span>
      </div>
      ${op ? `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2) var(--space-4); font-size: var(--font-size-sm);">
          <div><span style="color: var(--color-text-secondary);">Tipo:</span> <strong>${op.tipo}</strong></div>
          <div><span style="color: var(--color-text-secondary);">Espécie:</span> <strong>${op.especie}</strong></div>
          <div><span style="color: var(--color-text-secondary);">Bitola:</span> <strong>${fmtBitola(op.bitola)} mm</strong></div>
          <div><span style="color: var(--color-text-secondary);">Turno:</span> <strong>${op.turno}</strong></div>
        </div>
      ` : `
        <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0;">Nenhum setup definido para a serra. Clique para configurar e abrir a primeira ordem de produção.</p>
      `}
      ${canActions ? `
        <div style="margin-top: var(--space-3); text-align: right;">
          <span class="btn btn-secondary btn-sm" style="pointer-events: none;">${op ? 'Alterar Setup' : 'Definir Setup'}</span>
        </div>
      ` : ''}
    </div>
  `;

  const filteredOps = serraOps.filter(o => filterStatus === 'Todas' || o.status === filterStatus);

  const rowsHtml = filteredOps.length === 0
    ? `<tr><td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma ordem de produção encontrada.</td></tr>`
    : filteredOps.map(o => `
        <tr>
          <td style="font-weight: 600; color: var(--color-primary);">${o.codigo_op || '-'}</td>
          <td>${o.tipo}</td>
          <td>${o.especie}</td>
          <td>${fmtBitola(o.bitola)} mm</td>
          <td style="font-size: var(--font-size-xs);">${o.turno}</td>
          <td><span class="badge ${o.status === 'Ativa' ? 'badge-success' : 'badge-neutral'}">${o.status}</span></td>
          <td style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${o.responsavel_nome || '-'}</td>
        </tr>
      `).join('');

  return `
    <div style="max-width: 1500px; margin: 0 auto; width: 100%;">
      ${cardHtml}

      <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
        <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
          <select id="serra-filter-status" class="filter-select" style="font-size: var(--font-size-sm); height: 34px;">
            <option value="Todas" ${filterStatus === 'Todas' ? 'selected' : ''}>Todas as OPs</option>
            <option value="Ativa" ${filterStatus === 'Ativa' ? 'selected' : ''}>Ativas</option>
            <option value="Encerrada" ${filterStatus === 'Encerrada' ? 'selected' : ''}>Encerradas</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-outline btn-sm" id="btn-refresh-serra" style="height: 34px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.13-5.85L7 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 1 0-2.13 5.85L17 16"></path></svg>
            Atualizar Dados
          </button>
        </div>
      </div>

      <div class="card" style="border-color: var(--color-border); background: var(--color-surface); padding: 0; overflow: hidden;">
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th style="font-size: var(--font-size-xs);">OP</th>
                <th style="font-size: var(--font-size-xs);">Tipo</th>
                <th style="font-size: var(--font-size-xs);">Espécie</th>
                <th style="font-size: var(--font-size-xs);">Bitola</th>
                <th style="font-size: var(--font-size-xs);">Turno</th>
                <th style="font-size: var(--font-size-xs);">Status</th>
                <th style="font-size: var(--font-size-xs);">Definido por</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function bindSerraEvents() {
  document.querySelector('.serra-card')?.addEventListener('click', () => {
    if (!hasModuleAccess('pcp', 'can_actions')) return;
    showSerraSetupModal();
  });

  const btnRefresh = document.getElementById('btn-refresh-serra');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = 'Atualizando...';
      await fetchSerraOps(true);
      window.dispatchEvent(new Event('serra_changed'));
      showToast('Dados atualizados com sucesso!', 'success');
    });
  }

  document.getElementById('serra-filter-status')?.addEventListener('change', (e) => {
    filterStatus = e.target.value;
    window.dispatchEvent(new Event('serra_changed'));
  });
}

function optionsHtml(values, formatter, selectedValue) {
  return values.map(v => `<option value="${v}" ${selectedValue !== undefined && String(selectedValue) === String(v) ? 'selected' : ''}>${formatter(v)}</option>`).join('');
}

async function showSerraSetupModal() {
  const activeOp = getActiveOp();

  let temApontamentos = false;
  if (activeOp) {
    const { count } = await supabase
      .from('serra_apontamentos')
      .select('id', { count: 'exact', head: true })
      .eq('op_id', activeOp.id);
    temApontamentos = (count || 0) > 0;
  }

  const modalBody = `
    <form id="serra-setup-form" class="modal-form" style="font-size: var(--font-size-sm);">
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Tipo<span class="required">*</span></label>
          <select class="form-select" id="sr-tipo" required>
            ${optionsHtml(TIPOS, v => v, activeOp?.tipo ?? TIPOS[0])}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Espécie<span class="required">*</span></label>
          <select class="form-select" id="sr-especie" required>
            <option value="">Selecione...</option>
            ${optionsHtml(SETUP_OPCOES.especies, v => v, activeOp?.especie)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Bitola (mm)<span class="required">*</span></label>
          <select class="form-select" id="sr-bitola" required>
            <option value="">Selecione...</option>
            ${optionsHtml(SETUP_OPCOES.bitolas, fmtBitola, activeOp ? Number(activeOp.bitola) : undefined)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Turno<span class="required">*</span></label>
          <select class="form-select" id="sr-turno" required>
            <option value="">Selecione...</option>
            ${optionsHtml(SETUP_OPCOES.turnos, v => v, activeOp?.turno)}
          </select>
        </div>
      </div>

      <div class="form-grid-2" style="margin-top: var(--space-4); border-top: 1px solid var(--color-border); padding-top: var(--space-4);">
        <div class="form-group">
          <label class="form-label">Senha (PIN) do Apontador<span class="required">*</span></label>
          <input type="text" class="form-input" id="sr-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="****" required autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore style="-webkit-text-security: disc; text-security: disc; letter-spacing: 8px; font-weight: 600; text-align: center;" />
        </div>
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <input type="text" class="form-input" id="sr-responsavel" readonly placeholder="Aguardando PIN..." style="background: var(--color-surface-alt);" />
        </div>
      </div>
      <div id="sr-pin-erro" style="color: var(--color-error); font-size: var(--font-size-xs); min-height: 16px;"></div>

      ${activeOp ? `
        <div style="margin-top: var(--space-4); background: var(--color-surface-alt); border: 1px solid var(--color-border-light); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--font-size-xs); color: var(--color-text-secondary);">
          Alterar qualquer parâmetro acima encerrará a OP ativa <strong>${activeOp.codigo_op}</strong> e abrirá uma nova ordem de produção com as especificações atualizadas.
          ${temApontamentos ? ' Como ela já possui apontamentos registrados, ficará arquivada como "Encerrada" no histórico.' : ' Como ela ainda não possui apontamentos registrados, será excluída automaticamente ao invés de arquivada.'}
        </div>
      ` : ''}
    </form>
  `;

  openModal('Setup da Serra', modalBody, `<button class="btn btn-primary" id="btn-save-serra-setup" disabled>Salvar Setup</button>`, { maxWidth: '620px' });

  const pinInput = document.getElementById('sr-pin');
  const respInput = document.getElementById('sr-responsavel');
  const pinErro = document.getElementById('sr-pin-erro');
  const btnSave = document.getElementById('btn-save-serra-setup');

  const limparResponsavel = () => {
    respInput.value = '';
    btnSave.disabled = true;
  };

  pinInput.addEventListener('input', async () => {
    pinErro.textContent = '';
    if (pinInput.value.length !== 4) {
      limparResponsavel();
      return;
    }

    pinInput.disabled = true;
    respInput.value = 'Buscando...';
    try {
      // PIN validado no servidor (função validar_pin): o PIN dos apontadores nunca chega ao navegador
      const { data, error } = await supabase.rpc('validar_pin', { p_pin: pinInput.value });
      if (error) throw error;

      if (!data || data.length === 0) {
        pinErro.textContent = 'PIN inválido ou inativo.';
        pinInput.value = '';
        limparResponsavel();
      } else {
        respInput.value = data[0].nome_completo;
        btnSave.disabled = false;
      }
    } catch (error) {
      console.error('Error validating PIN:', error);
      pinErro.textContent = String(error.message).includes('PIN_BLOQUEADO')
        ? 'Muitas tentativas com PIN errado. Aguarde 5 minutos e tente novamente.'
        : 'Erro ao validar o PIN. Tente novamente.';
      pinInput.value = '';
      limparResponsavel();
    } finally {
      pinInput.disabled = false;
      if (btnSave.disabled) pinInput.focus();
    }
  });

  btnSave.addEventListener('click', async (e) => {
    const form = document.getElementById('serra-setup-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const btn = e.currentTarget;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    pinInput.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 8px;"></span> Salvando...`;

    let falhou = false;
    try {
      falhou = !(await saveSerraSetup(activeOp, pinInput.value, pinErro));
    } finally {
      btn.innerHTML = originalText;
      pinInput.disabled = false;
      pinInput.value = '';
      if (falhou) limparResponsavel();
    }
  });
}

// Retorna false quando o salvamento falhou e o modal deve continuar aberto (pede o PIN de novo).
async function saveSerraSetup(activeOp, pin, pinErro) {
  const payload = {
    tipo: document.getElementById('sr-tipo').value,
    especie: document.getElementById('sr-especie').value,
    bitola: parseFloat(document.getElementById('sr-bitola').value),
    turno: document.getElementById('sr-turno').value
  };

  if (activeOp
    && activeOp.tipo === payload.tipo
    && activeOp.especie === payload.especie
    && Number(activeOp.bitola) === payload.bitola
    && activeOp.turno === payload.turno) {
    showToast('Nenhuma alteração no setup foi detectada.', 'warning');
    closeModal();
    return true;
  }

  try {
    // A função do banco valida o PIN e as regras e troca o setup de forma atômica
    // (a OP anterior sai e a nova entra na mesma transação: nunca fica sem setup ativo).
    const { data, error } = await supabase.rpc('salvar_setup_serra', {
      p_pin: pin,
      p_tipo: payload.tipo,
      p_especie: payload.especie,
      p_bitola: payload.bitola,
      p_turno: payload.turno,
      p_bpl_id: getBPLID()
    });
    if (error) throw error;

    if (!data || data.length === 0) {
      pinErro.textContent = 'PIN inválido ou inativo.';
      return false;
    }

    showToast(`Setup da serra atualizado. Nova OP ${data[0].codigo_op} aberta.`, 'success');
    closeModal();
    await fetchSerraOps(true);
    window.dispatchEvent(new Event('serra_changed'));
    return true;
  } catch (error) {
    console.error('Error saving Serra setup:', error);
    const msg = String(error.message);
    if (msg.includes('PIN_BLOQUEADO')) pinErro.textContent = 'Muitas tentativas com PIN errado. Aguarde 5 minutos e tente novamente.';
    else if (msg.includes('SEM_PERMISSAO')) showToast('Você não tem permissão para alterar o setup da serra.', 'error');
    else if (msg.includes('FILIAL_NAO_PERMITIDA')) showToast('Você não tem acesso a esta filial.', 'error');
    else showToast('Erro ao salvar setup da serra.', 'error');
    return false;
  }
}
