// RQ03: envia por WhatsApp (BubbleWhats) o aviso e o PDF dos apontamentos REPROVADOS. Ver PLANO_RQ03.md, "Envio do
// PDF por WhatsApp". Chamada só pelo banco (gatilho de REPROVADO e temporizador pontual do pg_cron, via
// rq03_disparar_alertas), sem usuário logado: por isso verify_jwt = false e a autenticação é a chave do Vault
// (header x-alerta-chave), conferida por rq03_alerta_chave_valida.
//
// Por alerta: (1) mensagem de texto "RQ03 REPROVADA" com os dados (o send-doc não tem legenda; vai ANTES do PDF para
// o aviso chegar mesmo que o PDF falhe; texto_enviado_em evita repeti-lo numa retentativa); (2) gera o PDF chamando
// a rq03-relatorio-pdf em modo chave (um só gerador de PDF); (3) grava no bucket privado qualidade-alertas e cria uma
// URL assinada de 1 h — o send-doc só aceita URL pública; (4) send-doc; (5) rq03_alerta_finalizar registra o
// resultado (retentativa com espera crescente, até 5).
// O que enviar e para quem vem do banco (rq03_alerta_reservar: só destino ativo da filial do apontamento); a função
// não recebe nada do chamador além da chave. Usa service_role de propósito (Vault, Storage e leitura do registro).
// Garantia: pelo menos uma vez — se a função cair depois do envio e antes de gravar, o alerta pode ir duplicado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'qualidade-alertas';
const URL_VALIDADE_S = 3600;
const LIMITE_POR_EXECUCAO = 5;
const NOME_CATEGORIA: Record<string, string> = {
  comprimento: 'Comprimento', largura: 'Largura', espessura: 'Espessura', esquadro: 'Esquadro', temperatura: 'Temperatura',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Data e hora de Brasília (o servidor roda em UTC)
function dataHora(iso: string) {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return { dia: p('day'), mes: p('month'), ano: p('year'), hora: p('hour') === '24' ? '00' : p('hour'), minuto: p('minute') };
}

// Nome do arquivo como aparece no WhatsApp: sem acento/apóstrofo, data e hora de Brasília
function nomeArquivo(linha: string, criadoEm: string): string {
  const d = dataHora(criadoEm);
  const linhaLimpa = linha.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `RQ03-REPROVADO-${linhaLimpa}-${d.ano}-${d.mes}-${d.dia}-${d.hora}h${d.minuto}.pdf`;
}

// Texto do aviso (formatação do WhatsApp: *negrito*)
function textoAlerta(rq: { linha: string; created_at: string; responsavel_nome: string | null; resumo: any }): string {
  const d = dataHora(rq.created_at);
  const categorias: string[] = (rq.resumo?.categorias_reprovadas ?? []).map((c: string) => NOME_CATEGORIA[c] ?? c);
  return [
    '🚨 *RQ03 REPROVADA* 🚨',
    '',
    `🏭 *Linha:* ${rq.linha}`,
    `🕐 *Data/Hora:* ${d.dia}/${d.mes}/${d.ano} ${d.hora}:${d.minuto}`,
    `👷 *Apontador:* ${rq.responsavel_nome || '-'}`,
    ...(categorias.length > 0 ? [`❌ *Reprovado por:* ${categorias.join(', ')}`] : []),
    '',
    '📎 PDF com o detalhe a seguir.',
  ].join('\n');
}

// Chamada ao aparelho BubbleWhats; qualquer resposta que não seja { status: true } vira erro (o alerta retenta)
async function chamarBubbleWhats(cred: { device_id: string; token: string }, caminho: string, corpo: Record<string, string>) {
  const res = await fetch(`https://${cred.device_id}.bubblewhats.com/${caminho}`, {
    method: 'POST',
    headers: { Authorization: cred.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  });
  const resposta = await res.json().catch(() => null);
  if (!res.ok || resposta?.status !== true) {
    throw new Error(`BubbleWhats ${caminho} HTTP ${res.status}: ${JSON.stringify(resposta)?.slice(0, 300)}`);
  }
  return resposta;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const chave = req.headers.get('x-alerta-chave') ?? '';
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: chaveOk, error: erroChave } = await supabase.rpc('rq03_alerta_chave_valida', { p_chave: chave });
    if (erroChave || chaveOk !== true) return json({ error: 'Não autorizado' }, 401);

    const { data: alertas, error: erroReserva } = await supabase.rpc('rq03_alerta_reservar', { p_limite: LIMITE_POR_EXECUCAO });
    if (erroReserva) throw new Error(`reservar: ${erroReserva.message}`);
    if (!alertas || alertas.length === 0) return json({ processados: 0 });

    const { data: credenciais, error: erroCred } = await supabase.rpc('rq03_alerta_credenciais');
    const cred = credenciais?.[0];
    const semCredenciais = erroCred || !cred?.device_id || !cred?.token;

    // Sequencial (sem Promise.all): um alerta por vez
    const resultados: { alerta: string; resultado: string }[] = [];
    for (const a of alertas as any[]) {
      let ok = false;
      let mensagemId: string | null = null;
      let erro: string | null = null;
      try {
        if (semCredenciais) throw new Error('Credenciais do BubbleWhats ausentes no Vault');

        // 1) texto do aviso (uma vez só, mesmo que o PDF precise de nova tentativa)
        const { data: estado } = await supabase.from('qualidade_rq03_alertas').select('texto_enviado_em').eq('id', a.alerta_id).single();
        if (!estado?.texto_enviado_em) {
          const { data: rq, error: erroRq } = await supabase
            .from('qualidade_laminacao_rq03').select('linha, created_at, responsavel_nome, resumo').eq('id', a.registro_id).single();
          if (erroRq || !rq) throw new Error(`registro do alerta não encontrado: ${erroRq?.message ?? 'vazio'}`);
          await chamarBubbleWhats(cred, 'send-message', { jid: a.jid, message: textoAlerta(rq) });
          const { error: erroMarca } = await supabase.from('qualidade_rq03_alertas').update({ texto_enviado_em: new Date().toISOString() }).eq('id', a.alerta_id);
          if (erroMarca) console.error('Texto enviado, mas não foi possível marcar texto_enviado_em', a.alerta_id, erroMarca.message);
        }

        // 2) PDF (mesmo gerador do botão do portal, em modo chave)
        const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/rq03-relatorio-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, 'x-alerta-chave': chave },
          body: JSON.stringify({ id: a.registro_id }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!pdfRes.ok) throw new Error(`PDF: HTTP ${pdfRes.status}`);
        const pdf = new Uint8Array(await pdfRes.arrayBuffer());

        // 3) bucket privado + URL assinada (o BubbleWhats baixa o arquivo por ela)
        const caminho = `rq03/${a.bpl_id}/${a.registro_id}.pdf`;
        const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, pdf, { contentType: 'application/pdf', upsert: true });
        if (erroUpload) throw new Error(`upload do PDF: ${erroUpload.message}`);
        const { data: assinada, error: erroUrl } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, URL_VALIDADE_S);
        if (erroUrl || !assinada?.signedUrl) throw new Error(`URL assinada: ${erroUrl?.message ?? 'vazia'}`);

        // 4) envio do PDF
        const resposta = await chamarBubbleWhats(cred, 'send-doc', {
          jid: a.jid, filename: nomeArquivo(a.linha, a.criado_em), docurl: assinada.signedUrl,
        });
        ok = true;
        mensagemId = resposta?.response?.key?.id ?? null;
      } catch (err: any) {
        erro = err?.message || String(err);
        console.error('Falha no alerta de WhatsApp do RQ03', a.alerta_id, erro);
      }

      const { data: situacao, error: erroFinal } = await supabase.rpc('rq03_alerta_finalizar', {
        p_id: a.alerta_id, p_ok: ok, p_mensagem_id: mensagemId, p_erro: erro,
      });
      if (erroFinal) console.error('Falha ao registrar o resultado do alerta', a.alerta_id, erroFinal.message);
      resultados.push({ alerta: a.alerta_id, resultado: situacao ?? 'sem_registro' });
    }

    return json({ processados: resultados.length, resultados });
  } catch (err: any) {
    console.error('Erro no envio de alertas do RQ03:', err);
    return json({ error: err?.message || 'Erro interno' }, 500);
  }
});
