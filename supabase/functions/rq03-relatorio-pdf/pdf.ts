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
};

function fmtNum(v: number, casas: number): string {
  return Number(v).toFixed(casas).replace('.', ',');
}
function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function statusColor(status: string) { return status === 'PROBLEMA' ? RED : status === 'ALERTA' ? AMBER : GREEN; }
function statusBg(status: string) { return status === 'PROBLEMA' ? RED_BG : status === 'ALERTA' ? AMBER_BG : GREEN_BG; }

export async function gerarPdf(rq: Record<string, any>, fotos: Foto[]): Promise<Uint8Array> {
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

  const drawRect = (page: any, x: number, y: number, w: number, h: number, color: any) =>
    page.drawRectangle({ x, y, width: w, height: h, color });
  const drawText = (page: any, text: string, x: number, y: number, f: any, size: number, color = BLACK) =>
    page.drawText(text, { x, y, size, font: f, color });
  const textW = (f: any, text: string, size: number) => f.widthOfTextAtSize(text, size);
  const drawTextCentered = (page: any, text: string, xCenter: number, y: number, f: any, size: number, color = BLACK) =>
    drawText(page, text, xCenter - textW(f, text, size) / 2, y, f, size, color);
  const drawTextRight = (page: any, text: string, xRight: number, y: number, f: any, size: number, color = BLACK) =>
    drawText(page, text, xRight - textW(f, text, size), y, f, size, color);

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
    const texto = `Reprovado por: ${categorias.map((c) => NOME_TIPO[c] || c).join(', ')} — 2 ou mais itens com PROBLEMA na mesma medida.`;
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

  return pdfDoc.save();
}
