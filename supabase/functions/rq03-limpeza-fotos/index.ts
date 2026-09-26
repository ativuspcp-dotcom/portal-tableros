// RQ03: rotina diária de limpeza das fotos vencidas (retenção de 60 dias). Ver PLANO_RQ03.md, "Volume de fotos".
// Chamada só pelo pg_cron (função SQL rq03_disparar_limpeza), sem usuário logado: por isso verify_jwt = false e a
// autenticação é a chave do Vault (header x-limpeza-chave), conferida por rq03_limpeza_chave_valida.
//
// Usa service_role de propósito e só aqui: a Storage API só apaga o arquivo do disco com esse papel (apagar a
// linha em storage.objects por SQL deixa o arquivo lá). O escopo é mínimo: a função não recebe nada do chamador
// além da chave; o que apagar (buckets qualidade-fotos e qualidade-alertas, objetos além do prazo) e o prazo vêm do banco
// (rq03_limpeza_listar), que também carimba fotos_removidas_em (rq03_limpeza_marcar) no fim.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LOTE = 200;        // objetos por chamada de remoção
const MAX_LOTES = 25;    // teto por execução (5.000 objetos); o que sobrar sai na execução do dia seguinte
const TEMPO_MAX_MS = 100_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: chaveOk, error: erroChave } = await supabase.rpc('rq03_limpeza_chave_valida', { p_chave: req.headers.get('x-limpeza-chave') ?? '' });
    if (erroChave || chaveOk !== true) return json({ error: 'Não autorizado' }, 401);

    const inicio = Date.now();
    let apagados = 0;
    let erro: string | null = null;

    // Sequencial (sem Promise.all): lista um lote, remove pela Storage API, repete até acabar
    for (let i = 0; i < MAX_LOTES && Date.now() - inicio < TEMPO_MAX_MS; i++) {
      const { data: nomes, error: erroLista } = await supabase.rpc('rq03_limpeza_listar', { p_limite: LOTE });
      if (erroLista) { erro = `listar: ${erroLista.message}`; break; }
      if (!nomes || nomes.length === 0) break;

      // O banco devolve {bucket, nome} (fotos e PDFs dos alertas); a Storage API remove um bucket por vez
      const porBucket = new Map<string, string[]>();
      for (const o of nomes as { bucket: string; nome: string }[]) {
        porBucket.set(o.bucket, [...(porBucket.get(o.bucket) ?? []), o.nome]);
      }
      let removidosNoLote = 0;
      for (const [bucket, arquivos] of porBucket) {
        const { data: removidos, error: erroRemove } = await supabase.storage.from(bucket).remove(arquivos);
        if (erroRemove) { erro = `remover (${bucket}): ${erroRemove.message}`; break; }
        removidosNoLote += removidos?.length ?? 0;
      }
      apagados += removidosNoLote;
      if (erro) break;
      // Nada removido apesar de listado: evita repetir o mesmo lote para sempre
      if (removidosNoLote === 0) { erro = 'A Storage API não removeu nenhum dos objetos listados'; break; }
    }

    // Carimba os registros cujas fotos já saíram (mesmo se parou por erro: o que já foi apagado vale)
    const { data: marcados, error: erroMarca } = await supabase.rpc('rq03_limpeza_marcar');
    if (erroMarca) erro = `${erro ? erro + '; ' : ''}marcar: ${erroMarca.message}`;

    const resultado = { apagados, registros_marcados: marcados ?? 0, erro };
    if (erro) console.error('Limpeza de fotos do RQ03 terminou com erro', resultado);
    else console.log('Limpeza de fotos do RQ03 concluída', resultado);
    return json(resultado, erro ? 500 : 200);
  } catch (err: any) {
    console.error('Erro na limpeza de fotos do RQ03:', err);
    return json({ error: err?.message || 'Erro interno' }, 500);
  }
});
