// Geração do PDF do RQ03 (sem HTTP/auth aqui — ver index.ts). Separado num módulo próprio para poder ser
// testado localmente com `deno run` sem precisar subir o servidor da função (Deno.serve fica só no index.ts).
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as fontkitModulo from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

// O pacote é CommonJS: conforme o carregador o objeto vem em .default ou direto no módulo.
const fontkit = (fontkitModulo as any).default ?? fontkitModulo;

// A função roda nos servidores do Supabase, não dentro do portal: o caminho relativo /assets/... que a OP usa
// no navegador não existe aqui, então a logo vem pela URL pública completa do portal (arquivo em public/assets).
const LOGO_URL = 'https://portal-tableros.vercel.app/assets/logo-full.png';

// Poppins (a fonte do portal e dos demais relatórios). As fontes padrão de PDF não a incluem, então o arquivo
// TTF é baixado e embutido (só os caracteres usados entram no PDF). Se o download falhar cai na Helvetica.
const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Regular.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-SemiBold.ttf',
};

async function baixarBytes(url: string, o_que: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.error(`Falha ao baixar ${o_que}:`, err);
    return null; // logo/fonte são só acabamento: sem elas o PDF sai igual (não vale derrubar um alerta por isso)
  }
}

// Cores (mesma identidade dos relatórios do portal — components/romaneio-report.js).
const BRAND = rgb(0.169, 0.361, 0.275);        // #2b5c46
const BLACK = rgb(0.126, 0.129, 0.141);        // #202124
const GRAY_TEXT = rgb(0.373, 0.388, 0.408);    // #5f6368
const GRAY_BG = rgb(0.973, 0.976, 0.980);      // #f8f9fa
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.086, 0.639, 0.290);        // #16a34a - OK / APROVADO
const AMBER = rgb(0.851, 0.467, 0.024);        // #d97706 - ALERTA
const RED = rgb(0.863, 0.149, 0.149);          // #dc2626 - PROBLEMA / REPROVADO
const GREEN_BG = rgb(0.925, 0.980, 0.945);
const AMBER_BG = rgb(1.000, 0.965, 0.918);
const RED_BG = rgb(0.992, 0.949, 0.949);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Medida | coluna no banco | unidade | casas decimais | rótulo do item | rótulo do padrão/limite.
export const TIPOS = [
  { chave: 'comprimento', coluna: 'comprimento', nome: 'Comprimento', unidade: 'm', casas: 2, item: 'Lâmina', rotulo: 'Padrão' },
  { chave: 'largura', coluna: 'largura', nome: 'Largura', unidade: 'm', casas: 2, item: 'Lâmina', rotulo: 'Padrão' },
  { chave: 'espessura', coluna: 'espessura', nome: 'Espessura', unidade: 'mm', casas: 2, item: 'Lâmina', rotulo: 'Padrão' },
  { chave: 'esquadro', coluna: 'esquadro', nome: 'Esquadro', unidade: 'cm', casas: 2, item: 'Lâmina', rotulo: 'Limite' },
  { chave: 'temperatura', coluna: 'temperatura_roletes', nome: 'Temperatura', unidade: '°C', casas: 1, item: 'Rolete', rotulo: 'Limite' },
];
const NOME_TIPO: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.chave, t.nome]));

export type Foto = {
  tipoNome: string; item: string; ponto: number; valor: number; casas: number; unidade: string; padrao: number;
  caminho: string; bytes: Uint8Array | null;
  // 'expirada' = o Storage respondeu que o arquivo não existe (removido pelo prazo de 60 dias);
  // 'erro' = falha ao baixar (rede/permissão) — não é expiração e não deve ser rotulada como tal.
  estado?: 'ok' | 'expirada' | 'erro';
};

function fmtNum(v: number, casas: number): string {
  return Number(v).toFixed(casas).replace('.', ',');
}
// O servidor roda em UTC: a hora tem de ser convertida para Brasília, senão o PDF sai 3 h adiantado.
const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
function fmtDataHora(iso: string): string {
  const partes = FORMATO_DATA_HORA.formatToParts(new Date(iso));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour') === '24' ? '00' : p('hour')}:${p('minute')}`;
}
function statusColor(status: string) { return status === 'PROBLEMA' ? RED : status === 'ALERTA' ? AMBER : GREEN; }
function statusBg(status: string) { return status === 'PROBLEMA' ? RED_BG : status === 'ALERTA' ? AMBER_BG : GREEN_BG; }

// ---------- não conformidades (última página) ----------

type PontoProblema = { item: string; ponto: number | null; valor: number; desvio: number };
type GrupoProblema = { tipo: (typeof TIPOS)[number]; itensComProblema: number; totalItens: number; padrao: number; pontos: PontoProblema[] };

// Pontos com PROBLEMA das categorias que reprovaram (lista vazia = registro antigo sem resumo.categorias_reprovadas: todas)
function problemasDaReprovacao(rq: Record<string, any>, reprovadas: string[]): GrupoProblema[] {
  const grupos: GrupoProblema[] = [];
  for (const tipo of reprovadas.length > 0 ? TIPOS.filter((t) => reprovadas.includes(t.chave)) : TIPOS) {
    const dados = rq[tipo.coluna];
    if (!dados) continue;
    const pontos: PontoProblema[] = [];
    let itensComProblema = 0;
    for (const item of dados.itens ?? []) {
      const ruins = (item.medidas ?? []).filter((m: any) => m.status === 'PROBLEMA');
      if (ruins.length > 0) itensComProblema++;
      for (const m of ruins) {
        pontos.push({ item: `${tipo.item} ${item.indice}`, ponto: (item.medidas ?? []).length > 1 ? m.ponto : null, valor: m.valor, desvio: m.desvio });
      }
    }
    if (pontos.length > 0) grupos.push({ tipo, itensComProblema, totalItens: (dados.itens ?? []).length, padrao: dados.padrao, pontos });
  }
  return grupos;
}

// Decisão tomada sobre uma não conformidade (qualidade_rq03_decisoes); categoria = chave do tipo (comprimento, largura…)
export type Decisao = {
  categoria: string; texto: string; autor_nome: string; criado_em: string; editado_em: string | null; editado_por_nome: string | null;
};

export async function gerarPdf(rq: Record<string, any>, fotos: Foto[], decisoes: Decisao[] = []): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RQ03 - ${rq.linha} - ${fmtDataHora(rq.created_at)}`);
  pdfDoc.setProducer('Sistema PCP Tableros');

  pdfDoc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = [
    await baixarBytes(FONT_URLS.regular, 'a fonte Poppins Regular'),
    await baixarBytes(FONT_URLS.bold, 'a fonte Poppins SemiBold'),
    await baixarBytes(LOGO_URL, 'a logo do portal'),
  ];
  let font, fontBold;
  try {
    if (!regularBytes || !boldBytes) throw new Error('fonte não baixada');
    font = await pdfDoc.embedFont(regularBytes, { subset: true });
    fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });
  } catch (err) {
    console.error('Usando Helvetica no lugar da Poppins:', err);
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }
  const logoImage = logoBytes ? await pdfDoc.embedPng(logoBytes) : null;

  // Não conformidades (última página): categorias que reprovaram a RQ (resumo.categorias_reprovadas, gravado pelo
  // banco; a regra de reprovação mora só lá) com os pontos que deram PROBLEMA. Só em RQ REPROVADA.
  const listaReprovadas: string[] = rq.resumo?.categorias_reprovadas || [];
  const grupos = rq.status === 'REPROVADO' ? problemasDaReprovacao(rq, listaReprovadas) : [];

  const drawRect = (page: any, x: number, y: number, w: number, h: number, color: any) =>
    page.drawRectangle({ x, y, width: w, height: h, color });
  const drawText = (page: any, text: string, x: number, y: number, f: any, size: number, color = BLACK) =>
    page.drawText(text, { x, y, size, font: f, color });
  const textW = (f: any, text: string, size: number) => f.widthOfTextAtSize(text, size);
  const drawTextCentered = (page: any, text: string, xCenter: number, y: number, f: any, size: number, color = BLACK) =>
    drawText(page, text, xCenter - textW(f, text, size) / 2, y, f, size, color);
  const drawTextRight = (page: any, text: string, xRight: number, y: number, f: any, size: number, color = BLACK) =>
    drawText(page, text, xRight - textW(f, text, size), y, f, size, color);

  // Texto digitado por pessoas (decisões): a fonte pode não ter emoji etc. — o que ela não tem vira '?'
  const caracteresDaFonte = new Set<number>(font.getCharacterSet());
  const limparTexto = (t: string) => Array.from(t).map((c) => (caracteresDaFonte.has(c.codePointAt(0)!) ? c : '?')).join('');
  const quebrarTexto = (texto: string, f: any, tamanho: number, largura: number): string[] => {
    const linhas: string[] = [];
    for (const paragrafoBruto of texto.split(/\r?\n/)) { // separa os parágrafos ANTES de limpar (o \n não está na fonte)
      const paragrafo = limparTexto(paragrafoBruto);
      let atual = '';
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (textW(f, tentativa, tamanho) <= largura) { atual = tentativa; continue; }
        if (atual) linhas.push(atual);
        let resto = palavra; // palavra maior que a linha inteira: quebra por caractere
        while (textW(f, resto, tamanho) > largura) {
          let n = resto.length;
          while (n > 1 && textW(f, resto.slice(0, n), tamanho) > largura) n--;
          linhas.push(resto.slice(0, n));
          resto = resto.slice(n);
        }
        atual = resto;
      }
      linhas.push(atual);
    }
    return linhas;
  };

  // ---------- página 1: resumo ----------
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const logoDims = logoImage ? logoImage.scale(28 / logoImage.height) : { width: 0, height: 28 };
  if (logoImage) page.drawImage(logoImage, { x: MARGIN, y: y - logoDims.height, width: logoDims.width, height: logoDims.height });

  drawTextRight(page, 'REGISTRO DE QUALIDADE - LAMINAÇÃO', PAGE_W - MARGIN, y - 10, fontBold, 12.5, BRAND);
  drawTextRight(page, `RQ03 · ${rq.linha}`, PAGE_W - MARGIN, y - 24, fontBold, 10, BLACK);
  drawTextRight(page, `Gerado em ${fmtDataHora(new Date().toISOString())}`, PAGE_W - MARGIN, y - 36, font, 7.5, GRAY_TEXT);

  y -= Math.max(logoDims.height, 40) + 10;
  drawRect(page, MARGIN, y, CONTENT_W, 2, BRAND);
  y -= 20;

  // Badge do veredito + dados do apontamento
  const badgeColor = rq.status === 'REPROVADO' ? RED : GREEN;
  const badgeW = 110;
  drawRect(page, MARGIN, y - 22, badgeW, 24, badgeColor);
  drawTextCentered(page, rq.status, MARGIN + badgeW / 2, y - 14, fontBold, 12, WHITE);

  const infoX = MARGIN + badgeW + 16;
  drawText(page, `Data/Hora: ${fmtDataHora(rq.created_at)}`, infoX, y - 7, font, 9, BLACK);
  drawText(page, `Apontador: ${rq.responsavel_nome || '-'}`, infoX, y - 19, font, 9, BLACK);
  y -= 34;

  const categorias: string[] = rq.resumo?.categorias_reprovadas || [];
  if (rq.status === 'REPROVADO' && categorias.length > 0) {
    drawRect(page, MARGIN, y - 16, CONTENT_W, 18, RED_BG);
    const nomes = categorias.map((c) => NOME_TIPO[c] || c).join(', ');
    const completo = `Reprovado por: ${nomes} — 2 ou mais itens com PROBLEMA na mesma medida.`;
    const texto = textW(fontBold, completo, 8.5) <= CONTENT_W - 12 ? completo : `Reprovado por: ${nomes} — veja as não conformidades na última página.`;
    drawText(page, texto, MARGIN + 6, y - 11, fontBold, 8.5, RED);
    y -= 26;
  }

  // Legenda de cores
  const legenda: [string, any][] = [['OK', GREEN], ['ALERTA', AMBER], ['PROBLEMA', RED]];
  let lx = MARGIN;
  for (const [label, color] of legenda) {
    drawRect(page, lx, y - 8, 8, 8, color);
    drawText(page, label, lx + 12, y - 7, font, 7.5, GRAY_TEXT);
    lx += 12 + textW(font, label, 7.5) + 20;
  }
  y -= 22;

  // Tabela por medida
  const colItemW = 90;
  const colPontoW = (CONTENT_W - colItemW) / 2;
  const rowH = 15;

  for (const tipo of TIPOS) {
    const dados = (rq as Record<string, any>)[tipo.coluna];
    if (!dados) continue;

    drawRect(page, MARGIN, y - 16, CONTENT_W, 16, GRAY_BG);
    drawText(page, tipo.nome.toUpperCase(), MARGIN + 4, y - 11, fontBold, 8.5, BRAND);
    drawTextRight(page, `${tipo.rotulo}: ${fmtNum(dados.padrao, tipo.casas)} ${tipo.unidade}`, MARGIN + CONTENT_W - 4, y - 11, font, 8, GRAY_TEXT);
    y -= 16;

    const doisPontos = (dados.itens?.[0]?.medidas?.length ?? 1) > 1;
    drawText(page, tipo.item.toUpperCase(), MARGIN + 4, y - 9, fontBold, 7, GRAY_TEXT);
    drawTextCentered(page, doisPontos ? `${tipo.nome} 1` : tipo.nome, MARGIN + colItemW + colPontoW / 2, y - 9, fontBold, 7, GRAY_TEXT);
    if (doisPontos) drawTextCentered(page, `${tipo.nome} 2`, MARGIN + colItemW + colPontoW + colPontoW / 2, y - 9, fontBold, 7, GRAY_TEXT);
    y -= 12;

    for (const item of dados.itens ?? []) {
      const rowTop = y;
      (item.medidas ?? []).forEach((m: any, i: number) => {
        const cellX = MARGIN + colItemW + i * colPontoW;
        drawRect(page, cellX, rowTop - rowH + 2, colPontoW - 2, rowH - 2, statusBg(m.status));
      });
      drawText(page, `${tipo.item} ${item.indice}`, MARGIN + 4, rowTop - rowH + 5, font, 8, BLACK);
      (item.medidas ?? []).forEach((m: any, i: number) => {
        const cellX = MARGIN + colItemW + i * colPontoW;
        const txt = `${fmtNum(m.valor, tipo.casas)} ${tipo.unidade}`;
        drawTextCentered(page, txt, cellX + colPontoW / 2, rowTop - rowH + 5, fontBold, 8, statusColor(m.status));
      });
      y -= rowH;
    }
    y -= 6;
  }

  // Todas as fotos dos pontos com PROBLEMA já foram removidas (prazo de 60 dias): em vez de sumir com as
  // páginas de fotos sem explicação, a página 1 traz a caixa FOTOS EXPIRADAS e a lista desses pontos.
  if (fotos.length > 0 && fotos.every((f) => f.estado === 'expirada')) {
    const linhaH = 11;
    y -= 2;
    drawRect(page, MARGIN, y - 18, CONTENT_W, 18, GRAY_BG);
    drawText(page, 'FOTOS EXPIRADAS', MARGIN + 6, y - 12, fontBold, 8.5, GRAY_TEXT);
    drawTextRight(page, 'removidas após 60 dias · pontos com PROBLEMA', MARGIN + CONTENT_W - 6, y - 12, font, 7.5, GRAY_TEXT);
    y -= 18 + 6;

    if (grupos.length > 0) {
      drawText(page, 'Os pontos com PROBLEMA estão listados na última página.', MARGIN + 6, y - 8, font, 7.5, GRAY_TEXT);
    } else {
    const entradas = fotos.map((f) => `${f.tipoNome} · ${f.item} · Ponto ${f.ponto}: ${fmtNum(f.valor, f.casas)} ${f.unidade}`);
    const vagas = Math.max(0, Math.floor((y - (MARGIN + 16)) / linhaH)) * 2;
    const mostrar = entradas.length > vagas && vagas > 0
      ? [...entradas.slice(0, vagas - 1), `+ ${entradas.length - (vagas - 1)} pontos com PROBLEMA`]
      : entradas.slice(0, vagas);
    mostrar.forEach((texto, i) => {
      const coluna = i % 2;
      const linha = Math.floor(i / 2);
      drawText(page, texto, MARGIN + 6 + coluna * (CONTENT_W / 2), y - 8 - linha * linhaH, font, 7.5, RED);
    });
    }
  }

  drawText(page, `Gerado pelo Sistema PCP Tableros em ${fmtDataHora(new Date().toISOString())} — ${rq.id}`, MARGIN, MARGIN - 12, font, 7, GRAY_TEXT);

  // ---------- páginas seguintes: fotos das medidas com PROBLEMA ----------
  const comFoto = fotos.filter((f) => f.bytes);
  if (comFoto.length > 0) {
    const COLS = 2, ROWS = 3;
    const gap = 10;
    const cellW = (CONTENT_W - (COLS - 1) * gap) / COLS;
    const cellH = 175;
    let idx = 0;

    while (idx < comFoto.length) {
      const pageF = pdfDoc.addPage([PAGE_W, PAGE_H]);
      const py = PAGE_H - MARGIN;
      drawText(pageF, 'Fotos das medidas com PROBLEMA', MARGIN, py - 8, fontBold, 11, BRAND);

      for (let r = 0; r < ROWS && idx < comFoto.length; r++) {
        for (let c = 0; c < COLS && idx < comFoto.length; c++) {
          const f = comFoto[idx];
          idx++;
          const cellX = MARGIN + c * (cellW + gap);
          const cellTop = py - 30 - r * (cellH + 14);
          const boxW = cellW - 8;
          const boxH = cellH - 34;

          let img;
          try {
            img = await pdfDoc.embedJpg(f.bytes!);
          } catch (err) {
            console.error('Falha ao embutir foto no PDF', f.caminho, err);
            continue;
          }
          const scale = Math.min(boxW / img.width, boxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const imgX = cellX + (cellW - w) / 2;
          const imgY = cellTop - boxH + (boxH - h) / 2;
          pageF.drawImage(img, { x: imgX, y: imgY, width: w, height: h });

          const legenda1 = `${f.tipoNome} · ${f.item} · Ponto ${f.ponto}`;
          const legenda2 = `${fmtNum(f.valor, f.casas)} ${f.unidade} (padrão/limite ${fmtNum(f.padrao, f.casas)})`;
          drawTextCentered(pageF, legenda1, cellX + cellW / 2, cellTop - boxH - 10, fontBold, 8, RED);
          drawTextCentered(pageF, legenda2, cellX + cellW / 2, cellTop - boxH - 20, font, 7.5, GRAY_TEXT);
        }
      }
    }
  }

  // ---------- última página: NÃO CONFORMIDADE(S) ENCONTRADA(S) ----------
  // Uma página só para elas (ver `grupos` acima). Registro antigo sem a lista de categorias: todos os pontos com
  // PROBLEMA. Se não couber numa página (caso extremo), continua na seguinte.
  if (grupos.length > 0) {
    const LINHA_H = 14;
    const RODAPE_Y = MARGIN + 20;
    const colX = { item: MARGIN + 8, ponto: MARGIN + 190, medido: MARGIN + 270, desvio: MARGIN + 370 };
    let pg = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let yy = PAGE_H - MARGIN;

    const cabecalhoPagina = (continuacao: boolean) => {
      drawText(pg, continuacao ? 'NÃO CONFORMIDADE(S) ENCONTRADA(S) — continuação' : 'NÃO CONFORMIDADE(S) ENCONTRADA(S)', MARGIN, yy - 8, fontBold, 12.5, RED);
      drawText(pg, `RQ03 · ${rq.linha} · ${fmtDataHora(rq.created_at)} · Apontador: ${rq.responsavel_nome || '-'}`, MARGIN, yy - 23, font, 8.5, GRAY_TEXT);
      drawRect(pg, MARGIN, yy - 32, CONTENT_W, 2, RED);
      drawText(pg, `Gerado pelo Sistema PCP Tableros em ${fmtDataHora(new Date().toISOString())} — ${rq.id}`, MARGIN, MARGIN - 12, font, 7, GRAY_TEXT);
      yy -= 46;
    };
    cabecalhoPagina(false);

    drawText(pg, listaReprovadas.length > 0
      ? 'Categorias que reprovaram esta RQ: 2 ou mais itens com PROBLEMA na mesma medida.'
      : 'Todos os pontos com PROBLEMA deste registro.', MARGIN, yy - 2, font, 8.5, BLACK);
    yy -= 22;

    grupos.forEach((g, i) => {
      const { tipo } = g;
      const plural = tipo.item === 'Lâmina' ? 'lâminas' : 'roletes';
      const cabecalhoGrupo = (continuacao: boolean) => {
        drawRect(pg, MARGIN, yy - 20, CONTENT_W, 20, RED_BG);
        drawText(pg, `NC ${i + 1} · ${tipo.nome.toUpperCase()}${continuacao ? ' (continuação)' : ''}`, MARGIN + 8, yy - 14, fontBold, 9.5, RED);
        drawTextRight(pg, `${g.itensComProblema} de ${g.totalItens} ${plural} com problema · ${tipo.rotulo.toLowerCase()} ${fmtNum(g.padrao, tipo.casas)} ${tipo.unidade}`, MARGIN + CONTENT_W - 8, yy - 14, font, 8.5, GRAY_TEXT);
        yy -= 20;
        drawText(pg, tipo.item.toUpperCase(), colX.item, yy - 10, fontBold, 7, GRAY_TEXT);
        drawText(pg, 'PONTO', colX.ponto, yy - 10, fontBold, 7, GRAY_TEXT);
        drawText(pg, 'MEDIDO', colX.medido, yy - 10, fontBold, 7, GRAY_TEXT);
        drawText(pg, `DESVIO DO ${tipo.rotulo.toUpperCase()}`, colX.desvio, yy - 10, fontBold, 7, GRAY_TEXT);
        yy -= 14;
      };

      // Não deixa o título do grupo sozinho no pé da página
      if (yy - (20 + 14 + LINHA_H * 2) < RODAPE_Y) { pg = pdfDoc.addPage([PAGE_W, PAGE_H]); yy = PAGE_H - MARGIN; cabecalhoPagina(true); }
      cabecalhoGrupo(false);
      g.pontos.forEach((p, k) => {
        if (yy - LINHA_H < RODAPE_Y) { pg = pdfDoc.addPage([PAGE_W, PAGE_H]); yy = PAGE_H - MARGIN; cabecalhoPagina(true); cabecalhoGrupo(true); }
        if (k % 2 === 1) drawRect(pg, MARGIN, yy - LINHA_H + 2, CONTENT_W, LINHA_H, GRAY_BG);
        drawText(pg, p.item, colX.item, yy - 9, font, 8.5, BLACK);
        drawText(pg, p.ponto ? String(p.ponto) : '-', colX.ponto, yy - 9, font, 8.5, BLACK);
        drawText(pg, `${fmtNum(p.valor, tipo.casas)} ${tipo.unidade}`, colX.medido, yy - 9, fontBold, 8.5, RED);
        drawText(pg, `${p.desvio > 0 ? '+' : ''}${fmtNum(p.desvio, tipo.casas)} ${tipo.unidade}`, colX.desvio, yy - 9, font, 8.5, BLACK);
        yy -= LINHA_H;
      });

      // DECISÕES TOMADAS sobre esta NC (só se existirem)
      const decisoesDaNc = decisoes.filter((d) => d.categoria === tipo.chave);
      if (decisoesDaNc.length > 0) {
        const garantirEspaco = (altura: number) => {
          if (yy - altura < RODAPE_Y) { pg = pdfDoc.addPage([PAGE_W, PAGE_H]); yy = PAGE_H - MARGIN; cabecalhoPagina(true); }
        };
        garantirEspaco(40);
        yy -= 6;
        drawText(pg, 'DECISÕES TOMADAS', colX.item, yy - 8, fontBold, 8, BRAND);
        yy -= 14;
        for (const d of decisoesDaNc) {
          const editada = d.editado_em ? ` · editada por ${limparTexto(d.editado_por_nome || '-')} em ${fmtDataHora(d.editado_em)}` : '';
          garantirEspaco(11 + 11);
          drawText(pg, `${limparTexto(d.autor_nome)} · ${fmtDataHora(d.criado_em)}${editada}`, colX.item, yy - 8, fontBold, 7.5, GRAY_TEXT);
          yy -= 11;
          for (const linha of quebrarTexto(d.texto, font, 8.5, CONTENT_W - 16)) {
            garantirEspaco(11);
            drawText(pg, linha, colX.item, yy - 8, font, 8.5, BLACK);
            yy -= 11;
          }
          yy -= 5;
        }
      }
      yy -= 14;
    });
  }

  return pdfDoc.save();
}
