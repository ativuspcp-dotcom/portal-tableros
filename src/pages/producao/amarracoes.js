import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';

let amarracoesCache = [];
let currentStartDate = new Date().toISOString().split('T')[0];
let currentEndDate = new Date().toISOString().split('T')[0];
let searchQuery = '';

let currentPage = 0;
const PAGE_SIZE = 50;
let hasMoreAmarracoes = true;
let isFetchingAmarracoes = false;

export async function fetchAmarracoesProducao(forceRefresh = false, loadMore = false) {
  if (isFetchingAmarracoes) return;
  
  if (!loadMore) {
    currentPage = 0;
    hasMoreAmarracoes = true;
    amarracoesCache = [];
  }
  
  if (!hasMoreAmarracoes) return;
  
  isFetchingAmarracoes = true;
  
  try {
    let opIds = [];
    if (searchQuery) {
       const { data: ops } = await supabase.from('pcp_op_amarracao')
         .select('id')
         .ilike('codigo_op', `%${searchQuery}%`);
       if (ops && ops.length > 0) {
         opIds = ops.map(o => o.id);
       }
    }

    let query = supabase
      .from('amarracoes')
      .select(`
        id, qrcode, data_producao, created_at, cod_item, nome_item, qualidade, pecas, total_calc, 
        peso, local_producao, responsavel_nome, saida,
        pcp_op_amarracao (
          codigo_op
        )
      `)
      .gte('data_producao', currentStartDate)
      .lte('data_producao', currentEndDate)
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (searchQuery) {
      const sq = `%${searchQuery}%`;
      let orClause = `nome_item.ilike.${sq},qrcode.ilike.${sq},cod_item.ilike.${sq}`;
      if (opIds.length > 0) {
         orClause += `,op_id.in.(${opIds.join(',')})`;
      }
      query = query.or(orClause);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    if (data) {
      if (data.length < PAGE_SIZE) {
        hasMoreAmarracoes = false;
      }
      if (loadMore) {
        amarracoesCache = [...amarracoesCache, ...data];
      } else {
        amarracoesCache = data;
      }
      currentPage++;
    }
  } catch (error) {
    console.error('Error fetching amarracoes:', error);
    showToast('Erro ao carregar amarrações de produção', 'error');
  } finally {
    isFetchingAmarracoes = false;
  }
}

export function setAmarracoesDateFilter(startStr, endStr) {
  if (startStr) currentStartDate = startStr;
  if (endStr) currentEndDate = endStr;
}

export function renderAmarracoesProducaoView() {
  const tbody = amarracoesCache.length === 0 && !hasMoreAmarracoes
    ? `<tr><td colspan="11" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum pacote amarrado encontrado para estes filtros.</td></tr>`
    : amarracoesCache.map(pkg => {
        const opName = pkg.pcp_op_amarracao?.codigo_op || 'Avulso';
        const isSaida = pkg.saida === true;
        
        let dateTimeStr = '-';
        if (pkg.created_at) {
          const dateObj = new Date(pkg.created_at);
          const timeFormatted = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
          const dateFormatted = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          dateTimeStr = `${dateFormatted} às ${timeFormatted}`;
        }
        
        return `
        <tr>
          <td style="padding: 4px 8px;"><div style="font-weight: 500;">${pkg.qrcode || pkg.id.substring(0,8)}</div></td>
          <td style="padding: 4px 8px;">${dateTimeStr}</td>
          <td style="padding: 4px 8px;">${opName}</td>
          <td style="padding: 4px 8px;">
            <div style="font-size: 10px; color: var(--color-text-secondary); font-weight: 600;">${pkg.cod_item || 'S/N'}</div>
            <div style="font-weight: 500;">${pkg.nome_item}</div>
          </td>
          <td style="padding: 4px 8px;">${pkg.qualidade || '-'}</td>
          <td style="padding: 4px 8px; text-align: center;">${pkg.pecas || 0}</td>
          <td style="padding: 4px 8px; text-align: center;">${(pkg.total_calc || 0).toFixed(4)}</td>
          <td style="padding: 4px 8px; text-align: center;">${pkg.peso ? pkg.peso + ' kg' : '-'}</td>
          <td style="padding: 4px 8px;">${pkg.responsavel_nome || '-'}</td>
          <td style="padding: 4px 8px; text-align: center;">
            <span class="badge ${isSaida ? 'badge-success' : 'badge-warning'}">
              ${isSaida ? 'Saída Realizada' : 'Em Estoque'}
            </span>
          </td>
          <td style="padding: 4px 8px; text-align: right;">
            ${!isSaida ? `
              <button class="btn btn-ghost btn-icon btn-delete-amarracao" data-id="${pkg.id}" title="Excluir Pacote (Estorno)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-error);"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : `
              <button class="btn btn-ghost btn-icon" disabled title="Não é possível excluir pacote que já teve saída">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-secondary); opacity: 0.5;"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            `}
          </td>
        </tr>
      `}).join('');

  const sentinel = hasMoreAmarracoes
    ? `<tr id="amarracoes-sentinel"><td colspan="11" style="text-align: center; padding: 16px; color: var(--color-text-secondary);"><div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></div> Carregando mais pacotes...</td></tr>`
    : '';

  return `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; flex: 1;">
        
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Inicial</label>
          <input type="date" id="amarracoes-start-date" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${currentStartDate}">
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Final</label>
          <input type="date" id="amarracoes-end-date" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${currentEndDate}">
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; max-width: 300px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Pesquisar (Item, OP, Etiqueta)</label>
          <input type="text" id="amarracoes-search" class="form-input" style="height: 34px; font-size: var(--font-size-sm);" placeholder="Buscar..." value="${searchQuery}">
        </div>

      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary btn-sm" id="btn-refresh-amarracoes-prod" style="height: 34px;">
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
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">OP</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Item</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Qualidade</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Peças</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Volume (m³)</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Peso</th>
              <th style="font-size: var(--font-size-xs); padding: 6px 8px;">Apontador</th>
              <th style="text-align: center; font-size: var(--font-size-xs); padding: 6px 8px;">Status</th>
              <th style="text-align: right; font-size: var(--font-size-xs); padding: 6px 8px;">Ações</th>
            </tr>
          </thead>
          <tbody id="amarracoes-tbody">
            ${tbody}
            ${sentinel}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindAmarracoesProducaoEvents() {
  const startDate = document.getElementById('amarracoes-start-date');
  const endDate = document.getElementById('amarracoes-end-date');
  const searchInput = document.getElementById('amarracoes-search');
  const btnRefresh = document.getElementById('btn-refresh-amarracoes-prod');

  const executeSearch = async () => {
    if (startDate) currentStartDate = startDate.value;
    if (endDate) currentEndDate = endDate.value;
    if (searchInput) searchQuery = searchInput.value;
    
    if (btnRefresh) {
      btnRefresh.disabled = true;
      btnRefresh.innerHTML = 'Pesquisando...';
    }
    
    await fetchAmarracoesProducao(true);
    window.dispatchEvent(new Event('amarracoes_producao_changed'));
  };

  if (btnRefresh) {
    btnRefresh.addEventListener('click', executeSearch);
  }

  // Permite pesquisar ao pressionar "Enter" nos campos
  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      executeSearch();
    }
  };

  if (startDate) startDate.addEventListener('keypress', handleEnter);
  if (endDate) endDate.addEventListener('keypress', handleEnter);
  if (searchInput) searchInput.addEventListener('keypress', handleEnter);

  const sentinelEl = document.getElementById('amarracoes-sentinel');
  if (sentinelEl) {
    const observer = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting && !isFetchingAmarracoes) {
        await fetchAmarracoesProducao(false, true);
        window.dispatchEvent(new Event('amarracoes_producao_changed'));
      }
    }, { rootMargin: '100px' });
    observer.observe(sentinelEl);
  }

  document.querySelectorAll('.btn-delete-amarracao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const confirmed = await confirmDialog('Excluir Apontamento', 'Tem certeza que deseja excluir esta amarração/pacote? Se o pacote voltar no tempo ou for refeito, você deverá bipar novamente no aplicativo. Essa ação é irreversível.');
      if (!confirmed) return;
      
      try {
        const { data, error } = await supabase.from('amarracoes').delete().eq('id', id).select();
        if (error) throw error;
        
        if (!data || data.length === 0) {
          showToast('Permissão negada ou pacote não encontrado. O banco de dados recusou a exclusão.', 'error');
          return;
        }
        
        showToast('Pacote excluído com sucesso!', 'success');
        await fetchAmarracoesProducao(true);
        window.dispatchEvent(new Event('amarracoes_producao_changed'));
      } catch (err) {
        console.error('Error deleting amarracao', err);
        showToast('Erro ao excluir pacote. Verifique sua conexão.', 'error');
      }
    });
  });
}
