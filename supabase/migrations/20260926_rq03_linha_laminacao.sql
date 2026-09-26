-- RQ03: o apontamento passa a pertencer a uma LINHA de laminação (FEZER / OMECO), feito separado por linha
-- (2026-09-26). Não confundir com pcp_secadores: são equipamentos diferentes (Laminação x Secagem) que só
-- coincidem no nome de fábrica. Mesmo padrão de cadastro por filial usado em pcp_secadores/pcp_serras.
create table public.pcp_laminadoras (
  id uuid primary key default gen_random_uuid(),
  bpl_id integer not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique (bpl_id, nome)
);

alter table public.pcp_laminadoras enable row level security;

create policy "Usuários autenticados podem ver linhas de laminação"
  on public.pcp_laminadoras for select
  to authenticated
  using (true);

insert into public.pcp_laminadoras (bpl_id, nome) values (1, 'FEZER'), (1, 'OMECO');

-- Coluna nova + FK composta (mesmo padrão de pcp_op_serra -> pcp_serras). Tabela ainda vazia (sem apontamento
-- real gravado), então dá para exigir not null direto.
alter table public.qualidade_laminacao_rq03 add column linha text;
update public.qualidade_laminacao_rq03 set linha = 'FEZER' where linha is null; -- no-op: tabela vazia
alter table public.qualidade_laminacao_rq03 alter column linha set not null;
alter table public.qualidade_laminacao_rq03
  add constraint qualidade_laminacao_rq03_linha_fkey foreign key (bpl_id, linha) references public.pcp_laminadoras (bpl_id, nome);

create index qualidade_laminacao_rq03_bpl_linha_idx on public.qualidade_laminacao_rq03 (bpl_id, linha, created_at desc);

-- Função regravada com p_linha (Postgres não deixa "replace" mudando a lista de parâmetros; dropa a versão antiga,
-- mesmo padrão usado quando salvar_setup_serra ganhou p_serra).
drop function if exists public.registrar_rq03_laminacao(text, integer, uuid, jsonb);

-- Grava um apontamento do RQ03. p_dados:
--   { "padroes": {"comprimento": 2.60, "largura": 1.30, "espessura": 2.50},
--     "comprimento": [ [ {"valor":2.61,"foto_em":"<iso>"}, {...} ] x4 corpos ],  (idem largura, espessura)
--     "esquadro":    [ [ {...} ] x4 corpos ],
--     "temperatura": [ [ {...}, {...} ] x4 roletes ] }
-- As fotos já devem estar no bucket em rq03/<filial>/<linha>/<id>/<tipo>-<indice>-<ponto>.jpg (a função confere).
-- Devolve {"status":"OK","id":...,"ja_existia":bool}, {"status":"PIN_INVALIDO"} (não lança erro no PIN
-- inválido para não desfazer o registro da tentativa errada) ou {"status":"LINHA_INEXISTENTE"}.
create or replace function public.registrar_rq03_laminacao(
  p_pin text,
  p_bpl_id integer,
  p_linha text,
  p_id uuid,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_filiais jsonb;
  v_resp record;
  v_existente public.qualidade_laminacao_rq03;
  v_tipo text;
  v_n_pontos integer;
  v_casas integer;
  v_padrao numeric;
  v_itens jsonb;
  v_medidas jsonb;
  v_por_tipo jsonb := '{}'::jsonb;
  v_res jsonb := '{}'::jsonb;
  v_ok integer;
  v_alerta integer;
  v_problema integer;
  v_tot_ok integer := 0;
  v_tot_alerta integer := 0;
  v_tot_problema integer := 0;
  v_idx integer;
  v_pt integer;
  v_pontos jsonb;
  v_ponto jsonb;
  v_valor numeric;
  v_foto_em timestamptz;
  v_path text;
  v_status text;
  v_geral text;
begin
  if v_uid is null then
    raise exception 'NAO_AUTENTICADO' using errcode = '28000';
  end if;

  if not public.pode_registrar_qualidade_laminacao() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select coalesce(nullif(up.filiais_permitidas, '[]'::jsonb), '[1]'::jsonb)
    into v_filiais
    from public.user_profiles up
   where up.id = v_uid;

  if v_filiais is null or p_bpl_id is null or not (v_filiais @> to_jsonb(p_bpl_id)) then
    raise exception 'FILIAL_NAO_PERMITIDA' using errcode = '42501';
  end if;

  if p_id is null or p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'DADOS_INVALIDOS' using errcode = '22023';
  end if;

  if not exists (select 1 from public.pcp_laminadoras l where l.bpl_id = p_bpl_id and l.nome = p_linha and l.ativo) then
    return jsonb_build_object('status', 'LINHA_INEXISTENTE');
  end if;

  -- Duas requisições com o mesmo id (reenvio) não correm em paralelo.
  perform pg_advisory_xact_lock(hashtext('rq03_laminacao:' || p_id::text));

  -- Reenvio (a resposta anterior se perdeu na rede): já gravado por esta estação = sucesso, sem PIN.
  select * into v_existente from public.qualidade_laminacao_rq03 where id = p_id;
  if found then
    if v_existente.tablet_user_id <> v_uid then
      raise exception 'ID_EM_USO' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'OK', 'id', p_id, 'ja_existia', true);
  end if;

  select r.id, r.nome_completo into v_resp from public.validar_pin(p_pin) r;
  if not found then
    return jsonb_build_object('status', 'PIN_INVALIDO');
  end if;

  foreach v_tipo in array array['comprimento', 'largura', 'espessura', 'esquadro', 'temperatura'] loop
    v_n_pontos := case when v_tipo = 'esquadro' then 1 else 2 end;
    v_casas := case when v_tipo = 'temperatura' then 1 else 2 end;
    v_padrao := case v_tipo
      when 'temperatura' then 40
      when 'esquadro' then 3.00
      else round((p_dados -> 'padroes' ->> v_tipo)::numeric, 2)
    end;

    if v_padrao is null or v_padrao <= 0 or v_padrao >= 1000 then
      raise exception 'PADRAO_INVALIDO:%', v_tipo using errcode = '22023';
    end if;
    if jsonb_typeof(p_dados -> v_tipo) <> 'array' or jsonb_array_length(p_dados -> v_tipo) <> 4 then
      raise exception 'DADOS_INVALIDOS:%', v_tipo using errcode = '22023';
    end if;

    v_itens := '[]'::jsonb;
    v_ok := 0; v_alerta := 0; v_problema := 0;

    for v_idx in 1..4 loop
      v_pontos := p_dados -> v_tipo -> (v_idx - 1);
      if jsonb_typeof(v_pontos) <> 'array' or jsonb_array_length(v_pontos) <> v_n_pontos then
        raise exception 'DADOS_INVALIDOS:%', v_tipo using errcode = '22023';
      end if;

      v_medidas := '[]'::jsonb;
      for v_pt in 1..v_n_pontos loop
        v_ponto := v_pontos -> (v_pt - 1);
        v_valor := round((v_ponto ->> 'valor')::numeric, v_casas);
        v_foto_em := (v_ponto ->> 'foto_em')::timestamptz;

        if v_valor is null or v_valor <= 0 or v_valor >= 1000 or v_foto_em is null then
          raise exception 'MEDIDA_INVALIDA:%-%-%', v_tipo, v_idx, v_pt using errcode = '22023';
        end if;

        v_path := format('rq03/%s/%s/%s/%s-%s-%s.jpg', p_bpl_id, p_linha, p_id, v_tipo, v_idx, v_pt);
        if not exists (select 1 from storage.objects o where o.bucket_id = 'qualidade-fotos' and o.name = v_path) then
          raise exception 'FOTO_AUSENTE:%', v_path using errcode = '22023';
        end if;

        v_status := public.rq03_status_medida(v_tipo, v_valor, v_padrao);
        if v_status = 'OK' then v_ok := v_ok + 1;
        elsif v_status = 'ALERTA' then v_alerta := v_alerta + 1;
        else v_problema := v_problema + 1;
        end if;

        v_medidas := v_medidas || jsonb_build_object(
          'ponto', v_pt,
          'valor', v_valor,
          'desvio', round(v_valor - v_padrao, 2),
          'status', v_status,
          'foto', v_path,
          'foto_em', v_foto_em
        );
      end loop;

      v_itens := v_itens || jsonb_build_object('indice', v_idx, 'medidas', v_medidas);
    end loop;

    v_res := v_res || jsonb_build_object(v_tipo, jsonb_build_object('padrao', v_padrao, 'itens', v_itens));
    v_por_tipo := v_por_tipo || jsonb_build_object(v_tipo, jsonb_build_object('ok', v_ok, 'alerta', v_alerta, 'problema', v_problema));
    v_tot_ok := v_tot_ok + v_ok;
    v_tot_alerta := v_tot_alerta + v_alerta;
    v_tot_problema := v_tot_problema + v_problema;
  end loop;

  v_geral := case when v_tot_problema > 0 then 'PROBLEMA' when v_tot_alerta > 0 then 'ALERTA' else 'OK' end;

  insert into public.qualidade_laminacao_rq03 (
    id, bpl_id, linha, responsavel_id, responsavel_nome, tablet_user_id,
    comprimento, largura, espessura, esquadro, temperatura_roletes,
    status, qtd_ok, qtd_alerta, qtd_problema, resumo
  ) values (
    p_id, p_bpl_id, p_linha, v_resp.id, v_resp.nome_completo, v_uid,
    v_res -> 'comprimento', v_res -> 'largura', v_res -> 'espessura', v_res -> 'esquadro', v_res -> 'temperatura',
    v_geral, v_tot_ok, v_tot_alerta, v_tot_problema,
    jsonb_build_object('ok', v_tot_ok, 'alerta', v_tot_alerta, 'problema', v_tot_problema, 'por_tipo', v_por_tipo)
  );

  return jsonb_build_object('status', 'OK', 'id', p_id, 'ja_existia', false);
end;
$function$;

revoke execute on function public.registrar_rq03_laminacao(text, integer, text, uuid, jsonb) from public, anon;
grant execute on function public.registrar_rq03_laminacao(text, integer, text, uuid, jsonb) to authenticated;
