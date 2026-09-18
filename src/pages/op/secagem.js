import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { openModal, closeModal, confirmDialog } from '../../components/modal.js';
import { getBPLID } from '../../auth/auth.js';
import { hasModuleAccess } from '../../utils/permissions.js';

const SECADORES = ['FEZER', 'OMECO'];

const TURNOS = ['00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00'];

const SECADOR_CONFIG = {
  FEZER: {
    tipos: ['PRODUÇÃO', 'RESSEQUE'],
    especies: ['PINUS', 'EUCALIPTO'],
    larguras: [2.6],
    comprimentosFor: () => [1.3, 0.87],
    bitolas: [1.5, 1.8, 2.0, 2.2, 2.5, 2.7, 3.1, 3.3],
    turnos: TURNOS
  },
  OMECO: {
    tipos: ['PRODUÇÃO', 'RESSEQUE'],
    especies: ['PINUS', 'EUCALIPTO'],
    larguras: [2.6, 1.3],
    comprimentosFor: (largura) => (largura === 2.6 ? [1.3, 0.87] : [0.87]),
    bitolas: [1.5, 1.8, 2.0, 2.2, 2.5, 2.7, 3.1, 3.3],
    turnos: TURNOS
  }
};

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
  const canEdit = hasModuleAccess('pcp', 'can_edit') || hasModuleAccess('pcp', 'can_create');

  const cardsHtml = SECADORES.map(secador => {
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
        ${canEdit ? `
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
        // Toda OP Ativa pode ser excluída manualmente: os apontamentos de secagem
        // ainda não existem no sistema, então nenhuma OP Ativa tem produção registrada.
        const podeExcluir = op.status === 'Ativa';
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
          <td style="text-align: right;">
            ${canEdit && podeExcluir ? `
              <button class="btn btn-ghost btn-icon btn-delete-secagem-op" data-id="${op.id}" title="Excluir OP (sem apontamentos)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </td>
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
            ${SECADORES.map(s => `<option value="${s}" ${filterSecador === s ? 'selected' : ''}>${s}</option>`).join('')}
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
                <th style="width: 60px; text-align: right; font-size: var(--font-size-xs);">Ações</th>
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
      if (!hasModuleAccess('pcp', 'can_edit') && !hasModuleAccess('pcp', 'can_create')) return;
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

  document.querySelectorAll('.btn-delete-secagem-op').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const confirmed = await confirmDialog('Excluir OP', 'Tem certeza que deseja excluir esta Ordem de Produção de Secagem? Esta ação é irreversível.');
      if (!confirmed) return;

      try {
        const { error } = await supabase.from('pcp_op_secagem').delete().eq('id', id);
        if (error) throw error;
        showToast('OP excluída com sucesso', 'success');
        await fetchSecagemOps(true);
        window.dispatchEvent(new Event('secagem_changed'));
      } catch (e) {
        console.error(e);
        showToast('Erro ao excluir OP', 'error');
      }
    });
  });
}

function buildSelectOptions(values, formatter, selectedValue) {
  return values.map(v => `<option value="${v}" ${selectedValue !== undefined && Number(selectedValue) === Number(v) ? 'selected' : ''}>${formatter(v)}</option>`).join('');
}

function showSecagemSetupModal(secador) {
  const config = SECADOR_CONFIG[secador];
  const activeOp = getActiveOp(secador);

  const larguraInicial = activeOp ? Number(activeOp.largura) : config.larguras[0];
  const comprimentosDisponiveis = config.comprimentosFor(larguraInicial);

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
          <label class="form-label">Largura (m)<span class="required">*</span></label>
          <select class="form-select" id="sec-largura" required>
            ${buildSelectOptions(config.larguras, fmtDim, larguraInicial)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Comprimento (m)<span class="required">*</span></label>
          <select class="form-select" id="sec-comprimento" required>
            ${buildSelectOptions(comprimentosDisponiveis, fmtDim, activeOp ? Number(activeOp.comprimento) : undefined)}
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
      ${activeOp ? `
        <div style="margin-top: var(--space-4); background: var(--color-surface-alt); border: 1px solid var(--color-border-light); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--font-size-xs); color: var(--color-text-secondary);">
          Alterar qualquer parâmetro acima encerrará a OP ativa <strong>${activeOp.codigo_op}</strong> e abrirá uma nova ordem de produção com as especificações atualizadas. Como ela ainda não possui apontamentos registrados, será excluída automaticamente ao invés de arquivada.
        </div>
      ` : ''}
    </form>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="btn-save-secagem-setup">Salvar Setup</button>
  `;

  openModal(`Setup do Secador ${secador}`, modalBody, footerHTML, { maxWidth: '620px' });

  const larguraSel = document.getElementById('sec-largura');
  const comprimentoSel = document.getElementById('sec-comprimento');

  larguraSel.addEventListener('change', () => {
    const largura = parseFloat(larguraSel.value);
    const opcoes = config.comprimentosFor(largura);
    comprimentoSel.innerHTML = buildSelectOptions(opcoes, fmtDim, opcoes[0]);
  });

  document.getElementById('btn-save-secagem-setup').addEventListener('click', async (e) => {
    const form = document.getElementById('secagem-setup-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const btn = e.currentTarget;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 8px;"></span> Salvando...`;

    try {
      await saveSecagemSetup(secador, activeOp);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });
}

function buildSelectOptionsText(values, selectedValue) {
  return values.map(v => `<option value="${v}" ${selectedValue === v ? 'selected' : ''}>${v}</option>`).join('');
}

async function saveSecagemSetup(secador, activeOp) {
  const payload = {
    secador,
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
    return;
  }

  try {
    const bplId = getBPLID();

    if (activeOp) {
      // Apontamentos de secagem ainda não existem no sistema: toda OP Ativa está
      // sempre zerada, então a antiga é excluída em vez de arquivada como "Encerrada".
      // Quando a tabela de apontamentos de secagem for criada, trocar por uma
      // verificação real (ex.: contagem de registros vinculados a esta OP).
      const zerada = true;
      if (zerada) {
        const { error } = await supabase.from('pcp_op_secagem').delete().eq('id', activeOp.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pcp_op_secagem')
          .update({ status: 'Encerrada', encerrada_at: new Date().toISOString() })
          .eq('id', activeOp.id);
        if (error) throw error;
      }
    }

    const { data: latestOp } = await supabase
      .from('pcp_op_secagem')
      .select('codigo_op')
      .eq('secador', secador)
      .eq('bpl_id', bplId)
      .not('codigo_op', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (latestOp && latestOp.length > 0 && latestOp[0].codigo_op) {
      const match = latestOp[0].codigo_op.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const codigo_op = `SEC-${secador}-${String(nextNum).padStart(4, '0')}`;

    const { error } = await supabase.from('pcp_op_secagem').insert([{
      ...payload,
      codigo_op,
      bpl_id: bplId,
      status: 'Ativa'
    }]);
    if (error) throw error;

    showToast(`Setup do secador ${secador} atualizado. Nova OP ${codigo_op} aberta.`, 'success');
    closeModal();
    await fetchSecagemOps(true);
    window.dispatchEvent(new Event('secagem_changed'));
  } catch (error) {
    console.error('Error saving Secagem setup:', error);
    showToast('Erro ao salvar setup de secagem.', 'error');
  }
}
