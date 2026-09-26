// RQ03 - Registro de Qualidade - Laminação: gera o PDF de 1 apontamento (botão "Gerar PDF" do portal e envio
// automático por WhatsApp dos REPROVADOS, feito pela função rq03-alerta-whatsapp). Ver PLANO_RQ03.md na raiz do repo.
//
// Página 1: cabeçalho com a logo, veredito (APROVADO/REPROVADO), dados do apontamento e uma tabela por
// medida com cor por status (verde OK, amarelo ALERTA, vermelho PROBLEMA). Páginas seguintes: fotos das medidas com
// PROBLEMA e, por último, a página de NÃO CONFORMIDADE(S) ENCONTRADA(S) com as DECISÕES TOMADAS (se houver). O desenho
// do PDF em si fica em pdf.ts (sem HTTP), pra dar pra testar localmente com `deno run` sem subir servidor.
//
// Uso pelo portal: usa o JWT de quem chamou (nunca service_role): o SELECT do registro e o download das fotos
// respeitam a RLS de qualidade_laminacao_rq03/storage.objects (pode_ver_qualidade()) — sem checagem de permissão
// duplicada aqui.
// Uso automático (modo chave): a rq03-alerta-whatsapp não tem usuário logado e manda o header x-alerta-chave (chave
// do Vault, conferida por rq03_alerta_chave_valida); só nesse modo a função usa service_role, e apenas para ler o
// registro pedido e baixar as fotos dele.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { gerarPdf, TIPOS, type Foto } from "./pdf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'qualidade-fotos';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let supabase;
    const chaveAlerta = req.headers.get('x-alerta-chave') ?? '';
    if (chaveAlerta) {
      // Modo automático (alerta por WhatsApp): sem usuário logado, quem autoriza é a chave do Vault
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data: chaveOk } = await admin.rpc('rq03_alerta_chave_valida', { p_chave: chaveAlerta });
      if (chaveOk !== true) return json({ error: 'Não autorizado' }, 401);
      supabase = admin;
    } else {
      const authHeader = req.headers.get('Authorization') ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return json({ error: 'Missing Authorization header' }, 401);

      // Confirma que é um usuário logado de verdade (não só a anon key) — mesmo padrão das demais funções.
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      });
      if (!userRes.ok) return json({ error: 'Não autenticado' }, 401);

      // Cliente com o JWT de quem chamou: a RLS decide se essa pessoa pode ver este registro/estas fotos.
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    }

    const { id } = await req.json();
    if (!id) return json({ error: 'id é obrigatório' }, 400);

    const { data: rq, error } = await supabase
      .from('qualidade_laminacao_rq03')
      .select('id, bpl_id, linha, created_at, responsavel_nome, status, resumo, fotos_removidas_em, comprimento, largura, espessura, esquadro, temperatura_roletes')
      .eq('id', id)
      .single();
    if (error || !rq) return json({ error: 'Registro não encontrado ou sem permissão' }, 404);

    // Fotos das medidas com PROBLEMA (só essas entram no PDF; sequencial, sem Promise.all).
    const fotos: Foto[] = [];
    for (const tipo of TIPOS) {
      const dados = (rq as Record<string, any>)[tipo.coluna];
      for (const item of dados?.itens ?? []) {
        for (const m of item.medidas ?? []) {
          if (m.status === 'PROBLEMA') {
            fotos.push({ tipoNome: tipo.nome, item: `${tipo.item} ${item.indice}`, ponto: m.ponto, valor: m.valor, casas: tipo.casas, unidade: tipo.unidade, padrao: dados.padrao, caminho: m.foto, bytes: null });
          }
        }
      }
    }
    for (const foto of fotos) {
      // A rotina de limpeza (rq03-limpeza-fotos) já tirou as fotos do Storage: nem tenta baixar
      if (rq.fotos_removidas_em) { foto.estado = 'expirada'; continue; }
      try {
        const { data: blob, error: erroFoto } = await supabase.storage.from(BUCKET).download(foto.caminho);
        if (erroFoto || !blob) {
          // O Storage responde "não encontrado" para arquivo removido pelo prazo de 60 dias; outra falha é erro
          foto.estado = /not.?found|não encontrad|does not exist/i.test(String((erroFoto as any)?.message ?? '')) ? 'expirada' : 'erro';
          if (foto.estado === 'erro') console.error('Erro ao baixar foto', foto.caminho, erroFoto);
          continue;
        }
        foto.bytes = new Uint8Array(await blob.arrayBuffer());
        foto.estado = 'ok';
      } catch (err) {
        foto.estado = 'erro';
        console.error('Falha ao baixar foto', foto.caminho, err);
      }
    }

    // Decisões tomadas sobre as não conformidades (entram na última página quando existirem). Falha ao ler não derruba o PDF.
    const { data: decisoes, error: erroDecisoes } = await supabase
      .from('qualidade_rq03_decisoes')
      .select('categoria, texto, autor_nome, criado_em, editado_em, editado_por_nome')
      .eq('registro_id', id)
      .order('criado_em', { ascending: true });
    if (erroDecisoes) console.error('Erro ao ler as decisões do RQ03', erroDecisoes);

    const pdfBytes = await gerarPdf(rq, fotos, decisoes ?? []);

    return new Response(new Blob([Uint8Array.from(pdfBytes)]), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="RQ03-${(rq.linha || '').replace(/[^A-Za-z0-9]+/g, '-')}-${rq.id}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('Erro ao gerar relatório do RQ03:', err);
    return json({ error: err?.message || 'Erro interno' }, 500);
  }
});
