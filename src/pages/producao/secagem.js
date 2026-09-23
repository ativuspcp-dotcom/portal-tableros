import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';

let secagemProducaoCache = [];
let currentStartDate = new Date().toISOString().split('T')[0];
let currentEndDate = new Date().toISOString().split('T')[0];
let searchQuery = '';

let currentPage = 0;
const PAGE_SIZE = 50;
let hasMoreSecagemProducao = true;
let isFetchingSecagemProducao = false;

const fmtDim = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(3).replace('.', ','));
const fmtBitola = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(1).replace('.', ','));

// Busca paginada (range de 50 em 50) e só dispara ao clicar "Pesquisar" ou apertar Enter, nunca a
// cada tecla digitada — evita trazer milhares de linhas de uma vez, igual ao padrão de amarracoes.js.
export async function fetchSecagemProducao(forceRefresh = false, loadMore = false) {
  if (isFetchingSecagemProducao) return;

  if (!loadMore) {
    currentPage = 0;
    hasMoreSecagemProducao = true;
    secagemProducaoCache = [];
  }

  if (!hasMoreSecagemProducao) return;

  isFetchingSecagemProducao = true;

  try {
    let query = supabase
      .from('secagem_apontamentos')
      .select(`
        id, qrcode, data_apontamento, data_producao, local, turno, modo, especie, bitola,
        cod_item, item, altura_pecas, desconto, total, local_estoque, endereco,
        responsavel_nome, saida,
        pcp_op_secagem ( codigo_op )
      `)
      .gte('data_producao', currentStartDate)
      .lte('data_producao', currentEndDate)
      .order('data_apontamento', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (searchQuery) {
      const sq = `%${searchQuery}%`;
      query = query.or(`qrcode.ilike.${sq},item.ilike.${sq},cod_item.ilike.${sq},local.ilike.${sq}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data) {
      if (data.length < PAGE_SIZE) hasMoreSecagemProducao = false;
      secagemProducaoCache = loadMore ? [...secagemProducaoCache, ...data] : data;
      currentPage++;
    }
  } catch (error) {
    console.error('Error fetching secagem producao:', error);
    showToast('Erro ao carregar apontamentos de secagem', 'error');
  } finally {
    isFetchingSecagemProducao = false;
  }
}

export function setSecagemProducaoDateFilter(startStr, endStr) {
  if (startStr) currentStartDate = startStr;
  if (endStr) currentEndDate = endStr;
}

export function renderSecagemProducaoView() {
  const tbody = secagemProducaoCache.length === 0 && !hasMoreSecagemProducao
    ? `<tr><td colspan="12" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum apontamento de secagem encontrado para estes filtros.</td></tr>`
    : secagemProducaoCache.map(ap => {
        const opCodigo = ap.pcp_op_secagem?.codigo_op || '-';
        const isSaida = ap.saida === true;

        let dateTimeStr = '-';
        if (ap.data_apontamento) {
          const d = new Date(ap.data_apontamento);
          const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          dateTimeStr = `${date} às ${time}`;
        }

        return `
        <tr>
          <td style="padding: 4px 8px;"><div style="font-weight: 500;">${ap.qrcode || ap.id.substring(0, 8)}</div></td>
          <td style="padding: 4px 8px;">${dateTimeStr}</td>
          <td style="padding: 4px 8px;">
            <div style="font-weight: 500;">${ap.local}</div>
            <div style="font-size: 10px; color: var(--color-text-secondary);">${opCodigo}</div>
          </td>
          <td style="padding: 4px 8px; font-size: var(--font-size-xs);">${ap.turno}</td>
          <td style="padding: 4px 8px;">${ap.modo}</td>
          <td style="padding: 4px 8px;">${ap.especie}<br><span style="font-size: 10px; color: var(--color-text-secondary);">${fmtBitola(ap.bitola)} mm</span></td>
          <td style="padding: 4px 8px;">
            <div style="font-size: 10px; color: var(--color-text-secondary); font-weight: 600;">${ap.cod_item || 'S/N'}</div>
            <div style="font-weight: 500;">${ap.item || '-'}</div>
          </td>
          <td style="padding: 4px 8px; text-align: center;">${ap.altura_pecas ?? '-'}</td>
          <td style="padding: 4px 8px; text-align: center;">${ap.desconto ?? 0}</td>
          <td style="padding: 4px 8px; text-align: center;">${ap.total !== null && ap.total !== undefined ? Number(ap.total).toFixed(4) : '-'}</td>
          <td style="padding: 4px 8px;">
            <div>${ap.local_estoque}</div>
            <div style="font-size: 10px; color: var(--color-text-secondary);">${ap.endereco}</div>
          </td>
          <td style="padding: 4px 8px;">${ap.responsavel_nome || '-'}</td>
          <td style="padding: 4px 8px; text-align: center;">
            <span class="badge ${isSaida ? 'badge-success' : 'badge-warning'}">
              ${isSaida ? 'Saída Realizada' : 'Em Estoque'}
            </span>
          </td>
          <td style="padding: 4px 8px; text-align: right;">
            ${!isSaida ? `
              <button class="btn btn-ghost btn-icon btn-delete-secagem-apontamento" data-id="${ap.id}" title="Excluir Apontamento (Estorno)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : `
              <button class="btn btn-ghost btn-icon" disabled title="Não é possível excluir apontamento que já teve saída">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-secondary); opacity: 0.5;"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            `}
          </td>
        </tr>
      `}).join('');

  const sentinel = hasMoreSecagemProducao
    ? `<tr id="secagem-producao-sentinel"><td colspan="12" style="text-align: center; padding: 16px; color: var(--color-text-secondary);"><div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></div> Carregando mais apontamentos...</td></tr>`
    : '';

  return `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; flex: 1;">

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Inicial</label>
          <input type="date" id="secagem-producao-start-date" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${currentStartDate}">
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Final</label>
          <input type="date" id="secagem-producao-end-date" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${currentEndDate}">
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; max-width: 300px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Pesquisar (Etiqueta, Cód. Item, Item, Local)</label>
          <input type="text" id="secagem-producao-search" class="form-input" style="height: 34px; font-size: var(--font-size-sm);" placeholder="Buscar..." value="${searchQuery}">
        </div>

      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary btn-sm" id="btn-refresh-secagem-producao" style="height: 34px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Pesquisar
        </button>
      </div>
    </div>

    <div class="card" style="border-color: var(--color-border); background: var(--color-surface); display: flex; flex-direction: column; padding: 0; overflow: hidden;">
      <div class="table-container" style="flex: 1;">
        <table class="table">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Etiqueta (QR)</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Data/Hora</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Local / OP</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Turno</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Modo</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Espécie / Bitola</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Item</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Altura/Peças</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Desconto</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Total</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Estoque / Endereço</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Apontador</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Status</th>
              <th style="text-align: right; font-size: var(--font-size-xs); padding: 6px 8px;">Ações</th>
            </tr>
          </thead>
          <tbody id="secagem-producao-tbody">
            ${tbody}
            ${sentinel}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindSecagemProducaoEvents() {
  const startDate = document.getElementById('secagem-producao-start-date');
  const endDate = document.getElementById('secagem-producao-end-date');
  const searchInput = document.getElementById('secagem-producao-search');
  const btnRefresh = document.getElementById('btn-refresh-secagem-producao');

  const executeSearch = async () => {
    if (startDate) currentStartDate = startDate.value;
    if (endDate) currentEndDate = endDate.value;
    if (searchInput) searchQuery = searchInput.value;

    if (btnRefresh) {
      btnRefresh.disabled = true;
      btnRefresh.innerHTML = 'Pesquisando...';
    }

    await fetchSecagemProducao(true);
    window.dispatchEvent(new Event('secagem_producao_changed'));
  };

  if (btnRefresh) {
    btnRefresh.addEventListener('click', executeSearch);
  }

  const handleEnter = (e) => {
    if (e.key === 'Enter') executeSearch();
  };

  if (startDate) startDate.addEventListener('keypress', handleEnter);
  if (endDate) endDate.addEventListener('keypress', handleEnter);
  if (searchInput) searchInput.addEventListener('keypress', handleEnter);

  const sentinelEl = document.getElementById('secagem-producao-sentinel');
  if (sentinelEl) {
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !isFetchingSecagemProducao) {
        await fetchSecagemProducao(false, true);
        window.dispatchEvent(new Event('secagem_producao_changed'));
      }
    }, { rootMargin: '100px' });
    observer.observe(sentinelEl);
  }

  document.querySelectorAll('.btn-delete-secagem-apontamento').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const confirmed = await confirmDialog('Excluir Apontamento', 'Tem certeza que deseja excluir este apontamento de secagem? Se a peça voltar no tempo ou for reapontada, será preciso registrar novamente no aplicativo. Essa ação é irreversível.');
      if (!confirmed) return;

      try {
        const { data, error } = await supabase.from('secagem_apontamentos').delete().eq('id', id).select();
        if (error) throw error;

        if (!data || data.length === 0) {
          showToast('Permissão negada ou apontamento não encontrado. O banco de dados recusou a exclusão.', 'error');
          return;
        }

        showToast('Apontamento excluído com sucesso!', 'success');
        await fetchSecagemProducao(true);
        window.dispatchEvent(new Event('secagem_producao_changed'));
      } catch (err) {
        console.error('Error deleting secagem apontamento', err);
        showToast('Erro ao excluir apontamento. Verifique sua conexão.', 'error');
      }
    });
  });
}
