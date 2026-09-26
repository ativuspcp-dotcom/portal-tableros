import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { openModal } from '../../components/modal.js';
import { getBPLID } from '../../auth/auth.js';

// Qualidade > Registros > Laminação > RQ03: lista dos registros feitos no app (filial selecionada no cabeçalho) e
// detalhe com cada medida, o status calculado no banco e as fotos (bucket privado, link temporário).
// Busca paginada de 50 em 50, só ao clicar "Pesquisar" / Enter.

const PAGE_SIZE = 50;
const BUCKET = 'qualidade-fotos';
const hoje = () => new Date().toISOString().split('T')[0];

// "linhas" (plural) = as linhas da tabela carregadas; "linhaFiltro"/"opcoesLinha" = linha de laminação
// (CHINÊS 8' / CHINÊS 4', tabela pcp_laminadoras) — nomes de propósito diferentes, cuidado ao não confundir.
const estado = { inicio: hoje(), fim: hoje(), status: '', linhaFiltro: '', pagina: 0, temMais: true, buscando: false, linhas: [] };
let opcoesLinha = [];

// STATUS_BADGE/badge() = veredito GERAL do apontamento (APROVADO/REPROVADO). COR_STATUS = cor de cada
// MEDIDA individual (OK/ALERTA/PROBLEMA, dentro do detalhe) — são conceitos diferentes, não confundir.
const STATUS_BADGE = { APROVADO: 'badge-green', REPROVADO: 'badge-red' };
const badge = (s) => `<span class="badge ${STATUS_BADGE[s] || 'badge-gray'}">${s}</span>`;
const COR_STATUS = { OK: '#16a34a', ALERTA: '#d97706', PROBLEMA: '#dc2626' };
const NOME_TIPO = { comprimento: 'Comprimento', largura: 'Largura', espessura: 'Espessura', esquadro: 'Esquadro', temperatura: 'Temperatura' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (v, casas = 2) => (v === null || v === undefined ? '-' : Number(v).toFixed(casas).replace('.', ','));
const fmtDataHora = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Tipos na ordem de exibição do detalhe (coluna do banco → rótulos)
const TIPOS = [
  { chave: 'comprimento', coluna: 'comprimento', nome: 'Comprimento', unidade: 'm', item: 'Lâmina', rotuloPadrao: 'Padrão' },
  { chave: 'largura', coluna: 'largura', nome: 'Largura', unidade: 'm', item: 'Lâmina', rotuloPadrao: 'Padrão' },
  { chave: 'espessura', coluna: 'espessura', nome: 'Espessura', unidade: 'mm', item: 'Lâmina', rotuloPadrao: 'Padrão' },
  { chave: 'esquadro', coluna: 'esquadro', nome: 'Esquadro', unidade: 'cm', item: 'Lâmina', rotuloPadrao: 'Limite de alerta' },
  { chave: 'temperatura', coluna: 'temperatura_roletes', nome: 'Temperatura', unidade: '°C', item: 'Rolete', rotuloPadrao: 'Referência', casas: 1 }
];

async function buscar(maisUma = false) {
  if (estado.buscando) return;
  if (!maisUma) Object.assign(estado, { pagina: 0, temMais: true, linhas: [] });
  if (!estado.temMais) return;
  estado.buscando = true;

  try {
    const inicio = new Date(`${estado.inicio}T00:00:00`).toISOString();
    const fim = new Date(`${estado.fim}T23:59:59.999`).toISOString();
    let query = supabase
      .from('qualidade_laminacao_rq03')
      .select('id, created_at, linha, responsavel_nome, status, qtd_ok, qtd_alerta, qtd_problema')
      .eq('bpl_id', getBPLID())
      .gte('created_at', inicio)
      .lte('created_at', fim)
      .order('created_at', { ascending: false })
      .range(estado.pagina * PAGE_SIZE, (estado.pagina + 1) * PAGE_SIZE - 1);
    if (estado.status) query = query.eq('status', estado.status);
    if (estado.linhaFiltro) query = query.eq('linha', estado.linhaFiltro);

    const { data, error } = await query;
    if (error) throw error;
    if (data.length < PAGE_SIZE) estado.temMais = false;
    estado.linhas = maisUma ? [...estado.linhas, ...data] : data;
    estado.pagina++;
  } catch (err) {
    console.error('Erro ao carregar RQ03:', err);
    showToast('Erro ao carregar os registros do RQ03', 'error');
  } finally {
    estado.buscando = false;
  }
}

function htmlLista() {
  const corpo = estado.linhas.length === 0
    ? `<tr><td colspan="8" style="text-align: center; padding: var(--space-8); color: var(--color-text-secondary);">Nenhum registro encontrado para estes filtros.</td></tr>`
    : estado.linhas.map(r => `
        <tr>
          <td style="padding: 2px 8px; white-space: nowrap;">${fmtDataHora(r.created_at)}</td>
          <td style="padding: 2px 8px; font-weight: 600;">${esc(r.linha)}</td>
          <td style="padding: 2px 8px;">${esc(r.responsavel_nome)}</td>
          <td style="padding: 2px 8px; text-align: center;">${badge(r.status)}</td>
          <td style="padding: 2px 8px; text-align: center; color: ${COR_STATUS.OK}; font-weight: 600;">${r.qtd_ok}</td>
          <td style="padding: 2px 8px; text-align: center; color: ${COR_STATUS.ALERTA}; font-weight: 600;">${r.qtd_alerta}</td>
          <td style="padding: 2px 8px; text-align: center; color: ${COR_STATUS.PROBLEMA}; font-weight: 600;">${r.qtd_problema}</td>
          <td style="padding: 2px 8px; text-align: right;"><button class="btn btn-secondary btn-sm btn-rq03-detalhe" data-id="${r.id}">Ver detalhes</button></td>
        </tr>`).join('');

  const th = (t, extra = '') => `<th style="font-size: var(--font-size-xs); padding: 4px 8px; ${extra}">${t}</th>`;
  return `
    <h2 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); color: var(--color-text); margin: 0 0 var(--space-4);">REGISTRO DE QUALIDADE - LAMINAÇÃO</h2>
    <div class="toolbar" style="margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; justify-content: space-between;">
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Inicial</label>
          <input type="date" id="rq03-inicio" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${estado.inicio}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Data Final</label>
          <input type="date" id="rq03-fim" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);" value="${estado.fim}">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Linha</label>
          <select id="rq03-linha" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);">
            <option value="">Todas</option>
            ${opcoesLinha.map(l => `<option value="${esc(l)}" ${estado.linhaFiltro === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-secondary);">Status</label>
          <select id="rq03-status" class="form-input" style="height: 34px; width: 140px; font-size: var(--font-size-sm);">
            ${['', 'APROVADO', 'REPROVADO'].map(s => `<option value="${s}" ${estado.status === s ? 'selected' : ''}>${s || 'Todos'}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="rq03-pesquisar" style="height: 34px;">Pesquisar</button>
    </div>

    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="table-container">
        <table class="table table-compact">
          <thead><tr>
            ${th('Data/Hora')}${th('Linha')}${th('Apontador')}${th('Status', 'text-align: center;')}${th('OK', 'text-align: center;')}${th('Alerta', 'text-align: center;')}${th('Problema', 'text-align: center;')}${th('', 'text-align: right;')}
          </tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>
    ${estado.temMais && estado.linhas.length > 0 ? `<div style="text-align: center; margin-top: var(--space-4);"><button class="btn btn-secondary btn-sm" id="rq03-mais">Carregar mais</button></div>` : ''}
  `;
}

export async function montarRq03Laminacao(el) {
  const desenhar = () => {
    el.innerHTML = htmlLista();
    ligar();
  };

  const pesquisar = async () => {
    estado.inicio = document.getElementById('rq03-inicio').value || hoje();
    estado.fim = document.getElementById('rq03-fim').value || hoje();
    estado.status = document.getElementById('rq03-status').value;
    estado.linhaFiltro = document.getElementById('rq03-linha').value;
    const btn = document.getElementById('rq03-pesquisar');
    btn.disabled = true;
    btn.textContent = 'Pesquisando...';
    await buscar();
    desenhar();
  };

  function ligar() {
    document.getElementById('rq03-pesquisar').addEventListener('click', pesquisar);
    ['rq03-inicio', 'rq03-fim'].forEach(id => document.getElementById(id).addEventListener('keypress', (e) => { if (e.key === 'Enter') pesquisar(); }));
    document.getElementById('rq03-mais')?.addEventListener('click', async () => { await buscar(true); desenhar(); });
    el.querySelectorAll('.btn-rq03-detalhe').forEach(btn => btn.addEventListener('click', () => abrirDetalhe(btn.dataset.id)));
  }

  el.innerHTML = '<div class="card" style="padding: var(--space-8); text-align: center; color: var(--color-text-secondary);">Carregando...</div>';
  try {
    const { data, error } = await supabase.from('pcp_laminadoras').select('nome').eq('bpl_id', getBPLID()).eq('ativo', true).order('nome');
    if (error) throw error;
    opcoesLinha = (data || []).map(l => l.nome);
  } catch (err) {
    console.error('Erro ao carregar linhas de laminação:', err);
    opcoesLinha = [];
  }
  await buscar();
  desenhar();
}

// ---------- detalhe ----------

// Cor de cada status (mesma do PDF): borda forte + fundo claro. ALERTA em laranja.
const BG_STATUS = { OK: '#ecfaf1', ALERTA: '#fff6ea', PROBLEMA: '#fdf2f2' };
const corStatus = (s) => COR_STATUS[s] || '#9ca3af';

const fmtDesvio = (d) => (d > 0 ? `+${fmtNum(d)}` : fmtNum(d));

// Aba "Resultados": um cartão por medida, cada ponto numa caixa com borda e fundo da cor do status (sem fotos)
function htmlResultados(dados) {
  const cartao = (tipo) => {
    const d = dados[tipo.coluna];
    if (!d) return '';
    const casas = tipo.casas ?? 2;
    const linhas = d.itens.map(it => `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <span style="width: 64px; font-size: 11px; font-weight: 600; color: var(--color-text-secondary); flex-shrink: 0;">${tipo.item} ${it.indice}</span>
        ${it.medidas.map(m => `
          <div title="${m.status} · desvio ${fmtDesvio(m.desvio)}" style="flex: 1; min-width: 0; text-align: center; padding: 4px 6px; border: 2px solid ${corStatus(m.status)}; background: ${BG_STATUS[m.status] || '#fff'}; border-radius: 6px; line-height: 1.25;">
            <div style="font-size: 13px; font-weight: 700; color: ${corStatus(m.status)};">${fmtNum(m.valor, casas)}<span style="font-size: 10px; font-weight: 500;"> ${tipo.unidade}</span></div>
            <div style="font-size: 9px; color: var(--color-text-secondary);">${fmtDesvio(m.desvio)}</div>
          </div>`).join('')}
      </div>`).join('');
    return `
      <div class="card" style="padding: 10px 12px; margin: 0;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border-light);">
          <span style="font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .3px; color: var(--color-primary);">${tipo.nome}</span>
          <span style="font-size: 11px; color: var(--color-text-secondary);">${tipo.rotuloPadrao}: ${fmtNum(d.padrao, casas)} ${tipo.unidade}</span>
        </div>
        ${linhas}
      </div>`;
  };
  return `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-3);">${TIPOS.map(cartao).join('')}</div>`;
}

// Aba "Fotos": miniaturas agrupadas por medida, com moldura da cor do status; clicar abre a foto inteira
function htmlFotos(dados, urls) {
  const miniatura = (tipo, item, m) => {
    const cor = corStatus(m.status);
    const rotulo = `${item.indice}${item.medidas.length > 1 ? '·' + m.ponto : ''}`;
    const moldura = `border: 3px solid ${cor}; border-radius: 6px; background: ${BG_STATUS[m.status] || '#fff'};`;
    const conteudo = urls[m.foto]
      ? `<a href="${urls[m.foto]}" target="_blank" rel="noopener" style="display: block;"><img src="${urls[m.foto]}" loading="lazy" alt="Foto" style="display: block; width: 100%; height: 84px; object-fit: cover; border-radius: 3px;"></a>`
      // Sem link = a foto já não está no Storage (removida pelo prazo de 60 dias) ou não carregou; valores/status seguem no banco
      : `<div title="Foto indisponível: removida pelo prazo de retenção (60 dias) ou não carregou" style="height: 84px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--color-text-secondary); text-align: center;">Foto<br>indisponível</div>`;
    return `
      <div style="width: 116px;">
        <div style="${moldura} padding: 2px;">${conteudo}</div>
        <div style="text-align: center; font-size: 10px; margin-top: 2px; line-height: 1.2;"><strong style="color: ${cor};">${fmtNum(m.valor, tipo.casas ?? 2)} ${tipo.unidade}</strong><br><span style="color: var(--color-text-secondary);">${tipo.item} ${rotulo}</span></div>
      </div>`;
  };
  const secao = (tipo) => {
    const d = dados[tipo.coluna];
    if (!d) return '';
    const itens = d.itens.flatMap(it => it.medidas.map(m => miniatura(tipo, it, m))).join('');
    return `
      <div style="margin-bottom: var(--space-4);">
        <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .3px; color: var(--color-primary); margin-bottom: 6px;">${tipo.nome}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 10px;">${itens}</div>
      </div>`;
  };
  const legenda = [['OK', 'OK'], ['ALERTA', 'ALERTA'], ['PROBLEMA', 'PROBLEMA']]
    .map(([s, t]) => `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--color-text-secondary);"><span style="width: 10px; height: 10px; border-radius: 2px; background: ${corStatus(s)};"></span>${t}</span>`).join('');
  return `<div style="display: flex; gap: 14px; margin-bottom: var(--space-3);">${legenda}</div>${TIPOS.map(secao).join('')}`;
}

async function abrirDetalhe(id) {
  const { data: r, error } = await supabase
    .from('qualidade_laminacao_rq03')
    .select('id, created_at, linha, responsavel_nome, status, qtd_ok, qtd_alerta, qtd_problema, resumo, comprimento, largura, espessura, esquadro, temperatura_roletes')
    .eq('id', id)
    .single();
  if (error || !r) {
    showToast('Erro ao abrir o registro', 'error');
    return;
  }

  const categoriasReprovadas = r.resumo?.categorias_reprovadas || [];
  const estiloAba = (ativa) => `padding: 6px 14px; border: none; background: transparent; font-size: var(--font-size-sm); font-weight: ${ativa ? 600 : 400}; color: ${ativa ? 'var(--color-primary)' : 'var(--color-text-secondary)'}; border-bottom: 2px solid ${ativa ? 'var(--color-primary)' : 'transparent'}; cursor: pointer;`;
  const corpo = `
    <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; margin-bottom: var(--space-3);">
      ${badge(r.status)}
      <span>${fmtDataHora(r.created_at)}</span>
      <span>Linha: <strong>${esc(r.linha)}</strong></span>
      <span>Apontador: <strong>${esc(r.responsavel_nome)}</strong></span>
      <span style="color: ${COR_STATUS.OK};">${r.qtd_ok} OK</span>
      <span style="color: ${COR_STATUS.ALERTA};">${r.qtd_alerta} alerta</span>
      <span style="color: ${COR_STATUS.PROBLEMA};">${r.qtd_problema} problema</span>
    </div>
    ${categoriasReprovadas.length > 0 ? `<div class="error-text" style="margin-bottom: var(--space-3); font-size: var(--font-size-sm);">Reprovado por: ${categoriasReprovadas.map(t => NOME_TIPO[t] || t).join(', ')} (2 ou mais itens com problema nessa categoria)</div>` : ''}
    <div style="display: flex; gap: var(--space-2); border-bottom: 1px solid var(--color-border-light); margin-bottom: var(--space-4);">
      <button type="button" class="rq03-aba" data-aba="resultados" style="${estiloAba(true)}">Resultados</button>
      <button type="button" class="rq03-aba" data-aba="fotos" style="${estiloAba(false)}">Fotos</button>
    </div>
    <div id="rq03-aba-resultados">${htmlResultados(r)}</div>
    <div id="rq03-aba-fotos" style="display: none;"></div>`;

  const rodape = `<button class="btn btn-primary btn-sm" id="rq03-baixar-pdf">Gerar PDF</button>`;
  openModal('RQ03 · Registro de Qualidade – Laminação', corpo, rodape, { maxWidth: '960px' });
  document.getElementById('rq03-baixar-pdf').addEventListener('click', (e) => gerarPdf(r.id, e.currentTarget));

  // Fotos só são buscadas (links temporários de 1 h do bucket privado) quando a aba Fotos é aberta pela primeira vez
  let fotosCarregadas = false;
  const carregarFotos = async () => {
    fotosCarregadas = true;
    const painel = document.getElementById('rq03-aba-fotos');
    painel.innerHTML = '<div style="padding: var(--space-6); text-align: center; color: var(--color-text-secondary);">Carregando fotos...</div>';
    const caminhos = TIPOS.flatMap(t => (r[t.coluna]?.itens || []).flatMap(it => it.medidas.map(m => m.foto)));
    const urls = {};
    const { data: assinadas, error: erroUrls } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, 3600);
    if (erroUrls) showToast('Não foi possível carregar as fotos', 'error');
    (assinadas || []).forEach(a => { if (a.signedUrl) urls[a.path] = a.signedUrl; });
    if (document.getElementById('rq03-aba-fotos') === painel) painel.innerHTML = htmlFotos(r, urls);
  };

  document.querySelectorAll('.rq03-aba').forEach(btn => btn.addEventListener('click', () => {
    const aba = btn.dataset.aba;
    document.querySelectorAll('.rq03-aba').forEach(b => { b.style.cssText = estiloAba(b.dataset.aba === aba); });
    document.getElementById('rq03-aba-resultados').style.display = aba === 'resultados' ? '' : 'none';
    document.getElementById('rq03-aba-fotos').style.display = aba === 'fotos' ? '' : 'none';
    if (aba === 'fotos' && !fotosCarregadas) carregarFotos();
  }));
}

// PDF do apontamento (1 página de resumo + fotos das medidas com PROBLEMA), gerado no servidor pela edge
// function rq03-relatorio-pdf com o login de quem clicou (a RLS decide se pode ver o registro e as fotos).
async function gerarPdf(id, btn) {
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando PDF...';
  // Aba aberta já no clique (antes de esperar o servidor) para o bloqueador de pop-ups não barrar
  const aba = window.open('', '_blank');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/rq03-relatorio-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ id })
    });
    if (!res.ok) {
      const erro = await res.json().catch(() => ({}));
      throw new Error(erro.error || `Erro ${res.status}`);
    }
    const url = URL.createObjectURL(await res.blob());
    if (aba) aba.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    aba?.close();
    console.error('Erro ao gerar o PDF do RQ03:', err);
    showToast(`Não foi possível gerar o PDF: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}
