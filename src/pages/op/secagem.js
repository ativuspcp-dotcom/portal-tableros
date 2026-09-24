import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { openModal, closeModal } from '../../components/modal.js';
import { getBPLID } from '../../auth/auth.js';
import { hasModuleAccess } from '../../utils/permissions.js';

const TURNOS = ['00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00'];

// Opções fixas do setup. Também existem na função do banco salvar_setup_secador e no app-operacional
// (setup-secadores.js): alterar nos 3 lugares. Comprimento/Largura NÃO estão aqui: vêm da tabela
// pcp_secagem_setup_medidas (editável em Configurações > PCP > Secagem).
const SETUP_OPCOES = {
  tipos: ['PRODUÇÃO', 'RESSEQUE'],
  especies: ['PINUS', 'EUCALIPTO'],
  bitolas: [1.5, 1.8, 2.2, 2.5, 2.7, 3.1, 3.3],
  turnos: TURNOS
};

let secadores = [];
let medidasSetup = [];

const descendente = (a, b) => b - a;
const comprimentosDe = (secador) => [...new Set(medidasSetup.filter(m => m.secador === secador).map(m => Number(m.comprimento)))].sort(descendente);
const largurasDe = (secador, comprimento) => medidasSetup
  .filter(m => m.secador === secador && Number(m.comprimento) === Number(comprimento))
  .map(m => Number(m.largura))
  .sort(descendente);
let secagemOps = [];
let filterSecador = 'Todos';
let filterStatus = 'Ativa';

function fmtDim(v) {
  return Number(v).toFixed(3).replace('.', ',');
}

function fmtBitola(v) {
  return Number(v).toFixed(1).replace('.', ',');
}

export async function fetchSecagemOps(forceRefresh = false) {
  try {
    // Sequencial de propósito: não usar Promise.all em várias chamadas supabase.from()
    const { data: secData, error: secError } = await supabase
      .from('pcp_secadores')
      .select('nome')
      .eq('bpl_id', getBPLID())
      .eq('ativo', true)
      .order('nome');
    if (secError) throw secError;
    secadores = (secData || []).map(s => s.nome);

    const { data: medData, error: medError } = await supabase
      .from('pcp_secagem_setup_medidas')
      .select('secador, comprimento, largura')
      .eq('ativo', true);
    if (medError) throw medError;
    medidasSetup = medData || [];

    const { data, error } = await supabase
      .from('pcp_op_secagem')
      .select('*')
      .eq('bpl_id', getBPLID())
      .order('created_at', { ascending: false });

    if (error) throw error;
    secagemOps = data || [];
  } catch (error) {
    console.error('Error fetching Secagem OPs:', error);
    showToast('Erro ao carregar Ordens de Produção de Secagem', 'error');
  }
}

function getActiveOp(secador) {
  return secagemOps.find(op => op.secador === secador && op.status === 'Ativa') || null;
}

export function renderSecagemView() {
  const canActions = hasModuleAccess('pcp', 'can_actions');

  if (secadores.length === 0) {
    return `
      <div class="card" style="text-align: center; padding: var(--space-12); border-color: var(--color-border); background: var(--color-surface);">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-2); color: var(--color-text);">Secagem</h3>
        <p style="color: var(--color-text-secondary); max-width: 460px; margin: 0 auto; font-size: var(--font-size-sm);">Nenhum secador cadastrado para esta filial.</p>
      </div>
    `;
  }

  if (filterSecador !== 'Todos' && !secadores.includes(filterSecador)) filterSecador = 'Todos';

  const cardsHtml = secadores.map(secador => {
    const op = getActiveOp(secador);
    return `
      <div class="card secador-card" data-secador="${secador}" style="padding: var(--space-4); border-color: var(--color-border); background: var(--color-surface); cursor: pointer; transition: box-shadow var(--transition-fast), border-color var(--transition-fast);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">
          <div>
            <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Secador</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: var(--color-text);">${secador}</div>
          </div>
          <span class="badge ${op ? 'badge-success' : 'badge-neutral'}">${op ? 'ATIVA · ' + op.codigo_op : 'SEM SETUP'}</span>
        </div>
        ${op ? `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2) var(--space-4); font-size: var(--font-size-sm);">
            <div><span style="color: var(--color-text-secondary);">Tipo:</span> <strong>${op.tipo}</strong></div>
            <div><span style="color: var(--color-text-secondary);">Espécie:</span> <strong>${op.especie}</strong></div>
            <div><span style="color: var(--color-text-secondary);">Dimensões:</span> <strong>${fmtDim(op.comprimento)} x ${fmtDim(op.largura)} m</strong></div>
            <div><span style="color: var(--color-text-secondary);">Bitola:</span> <strong>${fmtBitola(op.bitola)} mm</strong></div>
            <div style="grid-column: span 2;"><span style="color: var(--color-text-secondary);">Turno:</span> <strong>${op.turno}</strong></div>
          </div>
        ` : `
          <p style="color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0;">Nenhum setup definido para este secador. Clique para configurar e abrir a primeira ordem de produção.</p>
        `}
        ${canActions ? `
          <div style="margin-top: var(--space-3); text-align: right;">
            <span class="btn btn-secondary btn-sm btn-edit-setup" data-secador="${secador}" style="pointer-events: none;">${op ? 'Alterar Setup' : 'Definir Setup'}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  const filteredOps = secagemOps.filter(op => {
    const matchSecador = filterSecador === 'Todos' || op.secador === filterSecador;
    const matchStatus = filterStatus === 'Todas' || op.status === filterStatus;
    return matchSecador && matchStatus;
  });

  const rowsHtml = filteredOps.length === 0
    ? `<tr><td colspan="9" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhuma ordem de produção encontrada.</td></tr>`
    : filteredOps.map(op => {
        return `
        <tr>
          <td style="font-weight: 600; color: var(--color-primary);">${op.codigo_op || '-'}</td>
          <td><span class="badge" style="background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-text);">${op.secador}</span></td>
          <td>${op.tipo}</td>
          <td>${op.especie}</td>
          <td>${fmtDim(op.comprimento)} x ${fmtDim(op.largura)} m</td>
          <td>${fmtBitola(op.bitola)} mm</td>
          <td style="font-size: var(--font-size-xs);">${op.turno}</td>
          <td>
            <span class="badge ${op.status === 'Ativa' ? 'badge-success' : 'badge-neutral'}">${op.status}</span>
          </td>
          <td style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">${op.responsavel_nome || '-'}</td>
        </tr>
      `}).join('');

  return `
    <div style="max-width: 1500px; margin: 0 auto; width: 100%;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
        ${cardsHtml}
      </div>

      <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; justify-content: space-between;">
        <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
          <select id="secagem-filter-secador" class="filter-select" style="font-size: var(--font-size-sm); height: 34px;">
            <option value="Todos" ${filterSecador === 'Todos' ? 'selected' : ''}>Todos os Secadores</option>
            ${secadores.map(s => `<option value="${s}" ${filterSecador === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <select id="secagem-filter-status" class="filter-select" style="font-size: var(--font-size-sm); height: 34px;">
            <option value="Todas" ${filterStatus === 'Todas' ? 'selected' : ''}>Todas as OPs</option>
            <option value="Ativa" ${filterStatus === 'Ativa' ? 'selected' : ''}>Ativas</option>
            <option value="Encerrada" ${filterStatus === 'Encerrada' ? 'selected' : ''}>Encerradas</option>
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-outline btn-sm" id="btn-refresh-secagem" style="height: 34px;">
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
                <th style="font-size: var(--font-size-xs);">Secador</th>
                <th style="font-size: var(--font-size-xs);">Tipo</th>
                <th style="font-size: var(--font-size-xs);">Espécie</th>
                <th style="font-size: var(--font-size-xs);">Dimensões (C x L)</th>
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

export function bindSecagemEvents() {
  document.querySelectorAll('.secador-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!hasModuleAccess('pcp', 'can_actions')) return;
      if (comprimentosDe(card.dataset.secador).length === 0) {
        showToast('Este secador ainda não tem medidas de setup ativas. Cadastre em Configurações > PCP > Secagem.', 'warning');
        return;
      }
      showSecagemSetupModal(card.dataset.secador);
    });
  });

  const btnRefresh = document.getElementById('btn-refresh-secagem');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = 'Atualizando...';
      await fetchSecagemOps(true);
      window.dispatchEvent(new Event('secagem_changed'));
      showToast('Dados atualizados com sucesso!', 'success');
    });
  }

  const selSecador = document.getElementById('secagem-filter-secador');
  if (selSecador) {
    selSecador.addEventListener('change', (e) => {
      filterSecador = e.target.value;
      window.dispatchEvent(new Event('secagem_changed'));
    });
  }

  const selStatus = document.getElementById('secagem-filter-status');
  if (selStatus) {
    selStatus.addEventListener('change', (e) => {
      filterStatus = e.target.value;
      window.dispatchEvent(new Event('secagem_changed'));
    });
  }

}

function buildSelectOptions(values, formatter, selectedValue) {
  return values.map(v => `<option value="${v}" ${selectedValue !== undefined && Number(selectedValue) === Number(v) ? 'selected' : ''}>${formatter(v)}</option>`).join('');
}

async function showSecagemSetupModal(secador) {
  const config = SETUP_OPCOES;
  const comprimentos = comprimentosDe(secador);
  const activeOp = getActiveOp(secador);

  let temApontamentos = false;
  if (activeOp) {
    const { count } = await supabase
      .from('secagem_apontamentos')
      .select('id', { count: 'exact', head: true })
      .eq('op_id', activeOp.id);
    temApontamentos = (count || 0) > 0;
  }

  // Se a medida do setup ativo foi desativada depois, cai para a primeira medida disponível.
  const comprimentoInicial = activeOp && comprimentos.includes(Number(activeOp.comprimento))
    ? Number(activeOp.comprimento)
    : comprimentos[0];
  const largurasDisponiveis = largurasDe(secador, comprimentoInicial);

  const modalBody = `
    <form id="secagem-setup-form" class="modal-form" style="font-size: var(--font-size-sm);">
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Tipo<span class="required">*</span></label>
          <select class="form-select" id="sec-tipo" required>
            <option value="">Selecione...</option>
            ${buildSelectOptionsText(config.tipos, activeOp?.tipo)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Espécie<span class="required">*</span></label>
          <select class="form-select" id="sec-especie" required>
            <option value="">Selecione...</option>
            ${buildSelectOptionsText(config.especies, activeOp?.especie)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Comprimento (m)<span class="required">*</span></label>
          <select class="form-select" id="sec-comprimento" required>
            ${buildSelectOptions(comprimentos, fmtDim, comprimentoInicial)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Largura (m)<span class="required">*</span></label>
          <select class="form-select" id="sec-largura" required>
            ${buildSelectOptions(largurasDisponiveis, fmtDim, activeOp ? Number(activeOp.largura) : undefined)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Bitola (mm)<span class="required">*</span></label>
          <select class="form-select" id="sec-bitola" required>
            <option value="">Selecione...</option>
            ${buildSelectOptions(config.bitolas, fmtBitola, activeOp ? Number(activeOp.bitola) : undefined)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Turno<span class="required">*</span></label>
          <select class="form-select" id="sec-turno" required>
            <option value="">Selecione...</option>
            ${buildSelectOptionsText(config.turnos, activeOp?.turno)}
          </select>
        </div>
      </div>

      <div class="form-grid-2" style="margin-top: var(--space-4); border-top: 1px solid var(--color-border); padding-top: var(--space-4);">
        <div class="form-group">
          <label class="form-label">Senha (PIN) do Apontador<span class="required">*</span></label>
          <input type="text" class="form-input" id="sec-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="****" required autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore style="-webkit-text-security: disc; text-security: disc; letter-spacing: 8px; font-weight: 600; text-align: center;" />
        </div>
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <input type="text" class="form-input" id="sec-responsavel" readonly placeholder="Aguardando PIN..." style="background: var(--color-surface-alt);" />
        </div>
      </div>
      <div id="sec-pin-erro" style="color: var(--color-error); font-size: var(--font-size-xs); min-height: 16px;"></div>

      ${activeOp ? `
        <div style="margin-top: var(--space-4); background: var(--color-surface-alt); border: 1px solid var(--color-border-light); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--font-size-xs); color: var(--color-text-secondary);">
          Alterar qualquer parâmetro acima encerrará a OP ativa <strong>${activeOp.codigo_op}</strong> e abrirá uma nova ordem de produção com as especificações atualizadas.
          ${temApontamentos ? ' Como ela já possui apontamentos registrados, ficará arquivada como "Encerrada" no histórico.' : ' Como ela ainda não possui apontamentos registrados, será excluída automaticamente ao invés de arquivada.'}
        </div>
      ` : ''}
    </form>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="btn-save-secagem-setup" disabled>Salvar Setup</button>
  `;

  openModal(`Setup do Secador ${secador}`, modalBody, footerHTML, { maxWidth: '620px' });

  const comprimentoSel = document.getElementById('sec-comprimento');
  const larguraSel = document.getElementById('sec-largura');

  comprimentoSel.addEventListener('change', () => {
    const comprimento = parseFloat(comprimentoSel.value);
    const opcoes = largurasDe(secador, comprimento);
    larguraSel.innerHTML = buildSelectOptions(opcoes, fmtDim, opcoes[0]);
  });

  const pinInput = document.getElementById('sec-pin');
  const respInput = document.getElementById('sec-responsavel');
  const pinErro = document.getElementById('sec-pin-erro');
  const btnSave = document.getElementById('btn-save-secagem-setup');

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
    const form = document.getElementById('secagem-setup-form');
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
      falhou = !(await saveSecagemSetup(secador, activeOp, pinInput.value, pinErro));
    } finally {
      btn.innerHTML = originalText;
      pinInput.disabled = false;
      pinInput.value = '';
      if (falhou) limparResponsavel();
    }
  });
}

function buildSelectOptionsText(values, selectedValue) {
  return values.map(v => `<option value="${v}" ${selectedValue === v ? 'selected' : ''}>${v}</option>`).join('');
}

// Retorna false quando o salvamento falhou e o modal deve continuar aberto (pede o PIN de novo).
async function saveSecagemSetup(secador, activeOp, pin, pinErro) {
  const payload = {
    tipo: document.getElementById('sec-tipo').value,
    especie: document.getElementById('sec-especie').value,
    largura: parseFloat(document.getElementById('sec-largura').value),
    comprimento: parseFloat(document.getElementById('sec-comprimento').value),
    bitola: parseFloat(document.getElementById('sec-bitola').value),
    turno: document.getElementById('sec-turno').value
  };

  if (activeOp
    && activeOp.tipo === payload.tipo
    && activeOp.especie === payload.especie
    && Number(activeOp.largura) === payload.largura
    && Number(activeOp.comprimento) === payload.comprimento
    && Number(activeOp.bitola) === payload.bitola
    && activeOp.turno === payload.turno) {
    showToast('Nenhuma alteração no setup foi detectada.', 'warning');
    closeModal();
    return true;
  }

  try {
    // A função do banco valida o PIN, as regras do secador e troca o setup de forma atômica
    // (a OP anterior sai e a nova entra na mesma transação: nunca fica sem setup ativo).
    const { data, error } = await supabase.rpc('salvar_setup_secador', {
      p_secador: secador,
      p_pin: pin,
      p_tipo: payload.tipo,
      p_especie: payload.especie,
      p_largura: payload.largura,
      p_comprimento: payload.comprimento,
      p_bitola: payload.bitola,
      p_turno: payload.turno,
      p_bpl_id: getBPLID()
    });
    if (error) throw error;

    if (!data || data.length === 0) {
      pinErro.textContent = 'PIN inválido ou inativo.';
      return false;
    }

    showToast(`Setup do secador ${secador} atualizado. Nova OP ${data[0].codigo_op} aberta.`, 'success');
    closeModal();
    await fetchSecagemOps(true);
    window.dispatchEvent(new Event('secagem_changed'));
    return true;
  } catch (error) {
    console.error('Error saving Secagem setup:', error);
    const msg = String(error.message);
    if (msg.includes('PIN_BLOQUEADO')) pinErro.textContent = 'Muitas tentativas com PIN errado. Aguarde 5 minutos e tente novamente.';
    else if (msg.includes('SEM_PERMISSAO')) showToast('Você não tem permissão para alterar o setup dos secadores.', 'error');
    else if (msg.includes('FILIAL_NAO_PERMITIDA')) showToast('Você não tem acesso a esta filial.', 'error');
    else showToast('Erro ao salvar setup de secagem.', 'error');
    return false;
  }
}
