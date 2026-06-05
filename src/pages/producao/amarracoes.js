import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';

let amarracoesCache = [];
let currentDateFilter = new Date().toISOString().split('T')[0];

export async function fetchAmarracoesProducao() {
  try {
    const { data, error } = await supabase
      .from('amarracoes')
      .select(`
        id, qrcode, data_producao, nome_item, qualidade, pecas, total_calc, 
        peso, local_producao, responsavel_nome, saida,
        pcp_op_amarracao (
          codigo_op
        )
      `)
      .eq('data_producao', currentDateFilter)
      .order('created_at', { ascending: false });

    if (error) throw error;
    amarracoesCache = data || [];
  } catch (error) {
    console.error('Error fetching amarracoes:', error);
    showToast('Erro ao carregar amarrações de produção', 'error');
  }
}

export function setAmarracoesDateFilter(dateStr) {
  currentDateFilter = dateStr;
}

export function renderAmarracoesProducaoView() {
  const tbody = amarracoesCache.length === 0 
    ? `<tr><td colspan="10" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum pacote amarrado encontrado para esta data.</td></tr>`
    : amarracoesCache.map(pkg => {
        const opName = pkg.pcp_op_amarracao?.codigo_op || 'Avulso';
        const isSaida = pkg.saida === true;
        
        return `
        <tr>
          <td><div style="font-weight: 500;">${pkg.qrcode || pkg.id.substring(0,8)}</div></td>
          <td>${opName}</td>
          <td><div style="font-weight: 500;">${pkg.nome_item}</div></td>
          <td>${pkg.qualidade || '-'}</td>
          <td style="text-align: center;">${pkg.pecas || 0}</td>
          <td style="text-align: center;">${(pkg.total_calc || 0).toFixed(4)}</td>
          <td style="text-align: center;">${pkg.peso ? pkg.peso + ' kg' : '-'}</td>
          <td>${pkg.responsavel_nome || '-'}</td>
          <td style="text-align: center;">
            <span class="badge ${isSaida ? 'badge-success' : 'badge-warning'}">
              ${isSaida ? 'Saída Realizada' : 'Em Estoque'}
            </span>
          </td>
          <td style="text-align: right;">
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

  return `
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; gap: var(--space-2); align-items: center; justify-content: space-between;">
      <div class="toolbar-left" style="display: flex; gap: var(--space-2); align-items: center;">
        <label for="amarracoes-date-filter" style="font-weight: 500; font-size: var(--font-size-sm); color: var(--color-text-secondary);">Data de Produção:</label>
        <input type="date" id="amarracoes-date-filter" class="form-input" style="height: 34px; width: 160px; font-size: var(--font-size-sm);" value="${currentDateFilter}">
      </div>
      <div class="toolbar-right">
        <button class="btn btn-outline btn-sm" id="btn-refresh-amarracoes-prod" style="height: 34px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 1 0 2.13-5.85L7 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 1 0-2.13 5.85L17 16"></path></svg>
          Atualizar Dados
        </button>
      </div>
    </div>
    
    <div class="card" style="border-color: var(--color-border); background: var(--color-surface); display: flex; flex-direction: column; padding: 0; overflow: hidden;">
      <div class="table-container" style="flex: 1;">
        <table class="table">
          <thead>
            <tr>
              <th style="font-size: var(--font-size-xs);">Etiqueta (QR)</th>
              <th style="font-size: var(--font-size-xs);">OP</th>
              <th style="font-size: var(--font-size-xs);">Item</th>
              <th style="font-size: var(--font-size-xs);">Qualidade</th>
              <th style="text-align: center; font-size: var(--font-size-xs);">Peças</th>
              <th style="text-align: center; font-size: var(--font-size-xs);">Volume (m³)</th>
              <th style="text-align: center; font-size: var(--font-size-xs);">Peso</th>
              <th style="font-size: var(--font-size-xs);">Apontador</th>
              <th style="text-align: center; font-size: var(--font-size-xs);">Status</th>
              <th style="text-align: right; font-size: var(--font-size-xs);">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${tbody}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindAmarracoesProducaoEvents() {
  const dateFilter = document.getElementById('amarracoes-date-filter');
  if (dateFilter) {
    dateFilter.addEventListener('change', async (e) => {
      setAmarracoesDateFilter(e.target.value);
      await fetchAmarracoesProducao();
      window.dispatchEvent(new Event('amarracoes_producao_changed'));
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-amarracoes-prod');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.innerHTML = 'Atualizando...';
      await fetchAmarracoesProducao();
      window.dispatchEvent(new Event('amarracoes_producao_changed'));
      showToast('Dados atualizados com sucesso!', 'success');
    });
  }

  document.querySelectorAll('.btn-delete-amarracao').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const confirmed = await confirmDialog('Excluir Apontamento', 'Tem certeza que deseja excluir esta amarração/pacote? Se o pacote voltar no tempo ou for refeito, você deverá bipar novamente no aplicativo. Essa ação é irreversível.');
      if (!confirmed) return;
      
      try {
        const { error } = await supabase.from('amarracoes').delete().eq('id', id);
        if (error) throw error;
        
        showToast('Pacote excluído com sucesso!', 'success');
        await fetchAmarracoesProducao();
        window.dispatchEvent(new Event('amarracoes_producao_changed'));
      } catch (err) {
        console.error('Error deleting amarracao', err);
        showToast('Erro ao excluir pacote. Verifique sua conexão.', 'error');
      }
    });
  });
}
