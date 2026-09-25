import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';

// PCP > Produção > Serra > Consumo: lâminas secas consumidas na Serra (QR bipado no app-operacional).
// Mesmo layout da Amarração: busca paginada (50 em 50) que só dispara ao clicar "Pesquisar" ou apertar Enter.

let consumoCache = [];
const hoje = () => new Date().toISOString().split('T')[0];
let currentStartDate = hoje();
let currentEndDate = hoje();
let searchQuery = '';

let currentPage = 0;
const PAGE_SIZE = 50;
let hasMoreConsumo = true;
let isFetchingConsumo = false;

const fmtDim = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(3).replace('.', ','));
const fmtBitola = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(1).replace('.', ','));

export async function fetchSerraConsumo(forceRefresh = false, loadMore = false) {
  if (isFetchingConsumo) return;

  if (!loadMore) {
    currentPage = 0;
    hasMoreConsumo = true;
    consumoCache = [];
  }

  if (!hasMoreConsumo) return;

  isFetchingConsumo = true;

  try {
    // data_consumo é timestamptz: o intervalo é do dia local inteiro, convertido para UTC
    const inicio = new Date(`${currentStartDate}T00:00:00`).toISOString();
    const fim = new Date(`${currentEndDate}T23:59:59.999`).toISOString();

    let query = supabase
      .from('serra_consumos')
      .select('id, qrcode, serra, data_consumo, cod_item, item, especie, bitola, comprimento, largura, altura_pecas, total, consumido_por_nome')
      .gte('data_consumo', inicio)
      .lte('data_consumo', fim)
      .order('data_consumo', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (searchQuery) {
      const sq = `%${searchQuery}%`;
      query = query.or(`qrcode.ilike.${sq},item.ilike.${sq},cod_item.ilike.${sq},serra.ilike.${sq}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data) {
      if (data.length < PAGE_SIZE) hasMoreConsumo = false;
      consumoCache = loadMore ? [...consumoCache, ...data] : data;
      currentPage++;
    }
  } catch (error) {
    console.error('Error fetching serra consumo:', error);
    showToast('Erro ao carregar consumos da serra', 'error');
  } finally {
    isFetchingConsumo = false;
  }
}

export function renderSerraConsumoView() {
  const tbody = consumoCache.length === 0 && !hasMoreConsumo
    ? `<tr><td colspan="10" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum consumo encontrado para estes filtros.</td></tr>`
    : consumoCache.map(c => {
        let dateTimeStr = '-';
        if (c.data_consumo) {
          const d = new Date(c.data_consumo);
          const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
          dateTimeStr = `${date} às ${time}`;
        }

        return `
        <tr>
          <td style="padding: 2px 8px;"><div style="font-weight: 500;">${c.qrcode}</div></td>
          <td style="padding: 2px 8px;">${dateTimeStr}</td>
          <td style="padding: 2px 8px; font-weight: 500;">${c.serra || '-'}</td>
          <td style="padding: 2px 8px;">
            <div style="font-size: 10px; color: var(--color-text-secondary); font-weight: 600; line-height: 1.2;">${c.cod_item || 'S/N'}</div>
            <div style="font-weight: 500; line-height: 1.2;">${c.item || '-'}</div>
          </td>
          <td style="padding: 2px 8px;">${c.especie || '-'}<span style="font-size: 10px; color: var(--color-text-secondary);"> · ${fmtBitola(c.bitola)} mm</span></td>
          <td style="padding: 2px 8px; white-space: nowrap;">${fmtDim(c.comprimento)} × ${fmtDim(c.largura)}</td>
          <td style="padding: 2px 8px; text-align: center;">${c.altura_pecas ?? '-'}</td>
          <td style="padding: 2px 8px; text-align: center;">${c.total !== null && c.total !== undefined ? Number(c.total).toFixed(4) : '-'}</td>
          <td style="padding: 2px 8px;">${c.consumido_por_nome || '-'}</td>
          <td style="padding: 2px 8px; text-align: right;">
            <button class="btn btn-ghost btn-icon btn-estornar-consumo" data-id="${c.id}" data-qrcode="${c.qrcode}" title="Estornar consumo (a lâmina volta ao estoque)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `}).join('');

  const sentinel = hasMoreConsumo
    ? `<tr id="serra-consumo-sentinel"><td colspan="10" style="text-align: center; padding: 16px; color: var(--color-text-secondary);"><div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></div> Carregando mais consumos...</td></tr>`
    : '';

  return `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; flex: 1;">

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Inicial</label>
          <input type="date" id="serra-consumo-start-date" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${currentStartDate}">
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Final</label>
          <input type="date" id="serra-consumo-end-date" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${currentEndDate}">
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; max-width: 300px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Pesquisar (Etiqueta, Cód. Item, Item, Serra)</label>
          <input type="text" id="serra-consumo-search" class="form-input" style="height: 34px; font-size: var(--font-size-sm);" placeholder="Buscar..." value="${searchQuery}">
        </div>

      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary btn-sm" id="btn-refresh-serra-consumo" style="height: 34px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          Pesquisar
        </button>
      </div>
    </div>

    <div class="card" style="border-color: var(--color-border); background: var(--color-surface); display: flex; flex-direction: column; padding: 0; overflow: hidden;">
      <div class="table-container" style="flex: 1;">
        <table class="table table-compact">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Etiqueta (QR)</th>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Data/Hora</th>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Serra</th>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Item</th>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Espécie / Bitola</th>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Comp. × Larg. (m)</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 4px 8px;">Altura/Peças</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 4px 8px;">Total (m³)</th>
              <th style="font-size: var(--font-size-xs); padding: 4px 8px;">Consumido por</th>
              <th style="text-align: right; font-size: var(--font-size-xs); padding: 4px 8px;">Ações</th>
            </tr>
          </thead>
          <tbody id="serra-consumo-tbody">
            ${tbody}
            ${sentinel}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindSerraConsumoEvents() {
  const startDate = document.getElementById('serra-consumo-start-date');
  const endDate = document.getElementById('serra-consumo-end-date');
  const searchInput = document.getElementById('serra-consumo-search');
  const btnRefresh = document.getElementById('btn-refresh-serra-consumo');

  const executeSearch = async () => {
    if (startDate) currentStartDate = startDate.value;
    if (endDate) currentEndDate = endDate.value;
    if (searchInput) searchQuery = searchInput.value;

    if (btnRefresh) {
      btnRefresh.disabled = true;
      btnRefresh.innerHTML = 'Pesquisando...';
    }

    await fetchSerraConsumo(true);
    window.dispatchEvent(new Event('serra_consumo_changed'));
  };

  if (btnRefresh) btnRefresh.addEventListener('click', executeSearch);

  const handleEnter = (e) => {
    if (e.key === 'Enter') executeSearch();
  };

  if (startDate) startDate.addEventListener('keypress', handleEnter);
  if (endDate) endDate.addEventListener('keypress', handleEnter);
  if (searchInput) searchInput.addEventListener('keypress', handleEnter);

  const sentinelEl = document.getElementById('serra-consumo-sentinel');
  if (sentinelEl) {
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !isFetchingConsumo) {
        await fetchSerraConsumo(false, true);
        window.dispatchEvent(new Event('serra_consumo_changed'));
      }
    }, { rootMargin: '100px' });
    observer.observe(sentinelEl);
  }

  document.querySelectorAll('.btn-estornar-consumo').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, qrcode } = btn.dataset;
      const confirmed = await confirmDialog('Estornar consumo', `Estornar o consumo da etiqueta <strong>${qrcode}</strong>? A lâmina volta ao estoque (Saída = Não) e pode ser bipada de novo.`);
      if (!confirmed) return;

      try {
        // Excluir o consumo devolve a lâmina ao estoque (gatilho no banco)
        const { data, error } = await supabase.from('serra_consumos').delete().eq('id', id).select();
        if (error) throw error;

        if (!data || data.length === 0) {
          showToast('Permissão negada ou consumo não encontrado. O banco de dados recusou o estorno.', 'error');
          return;
        }

        showToast('Consumo estornado. A lâmina voltou ao estoque.', 'success');
        await fetchSerraConsumo(true);
        window.dispatchEvent(new Event('serra_consumo_changed'));
      } catch (err) {
        console.error('Error estornando consumo da serra', err);
        showToast('Erro ao estornar o consumo. Verifique sua conexão.', 'error');
      }
    });
  });
}
