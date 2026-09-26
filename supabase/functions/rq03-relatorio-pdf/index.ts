// RQ03 - Registro de Qualidade - Laminação: gera o PDF de 1 apontamento (pensado para os REPROVADOS, que
// serão enviados por WhatsApp mais adiante — o envio ainda não está feito, essa função só gera o PDF para
// baixar/conferir no portal por enquanto). Ver PLANO_RQ03.md na raiz do repo.
//
// Página 1: cabeçalho com a logo, veredito (APROVADO/REPROVADO), dados do apontamento e uma tabela por
// medida com cor por status (verde OK, amarelo ALERTA, vermelho PROBLEMA). Páginas seguintes: só as fotos
// das medidas com PROBLEMA (as únicas que importam para investigar a reprovação). O desenho do PDF em si
// fica em pdf.ts (sem HTTP), pra dar pra testar localmente com `deno run` sem subir servidor.
//
// Usa o JWT de quem chamou (nunca service_role): o SELECT do registro e o download das fotos respeitam a
// RLS de qualidade_laminacao_rq03/storage.objects (pode_ver_qualidade()) — sem checagem de permissão
// duplicada aqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
import { gerarPdf, TIPOS, type Foto } from "./pdf.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const BUCKET = 'qualidade-fotos';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Missing Authorization header' }, 401);

    // Confirma que é um usuário logado de verdade (não só a anon key) — mesmo padrão das demais funções.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!userRes.ok) return json({ error: 'Não autenticado' }, 401);

    const { id } = await req.json();
    if (!id) return json({ error: 'id é obrigatório' }, 400);

    // Cliente com o JWT de quem chamou: a RLS decide se essa pessoa pode ver este registro/estas fotos.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: rq, error } = await supabase
      .from('qualidade_laminacao_rq03')
      .select('id, bpl_id, linha, created_at, responsavel_nome, status, resumo, comprimento, largura, espessura, esquadro, temperatura_roletes')
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

    const pdfBytes = await gerarPdf(rq, fotos);

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
