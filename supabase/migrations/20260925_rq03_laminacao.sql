-- RQ03 - Registro de Qualidade - Laminação (2026-09-25). Plano e decisões: PLANO_RQ03.md (raiz do projeto).
-- Um apontamento = 4 corpos de prova (comprimento, largura, espessura, esquadro) + 4 roletes (temperatura), com foto
-- carimbada em cada medida. Gravado só por registrar_rq03_laminacao (security definer); a tabela não tem policy de escrita.
-- A classificação (OK / ALERTA / PROBLEMA) é feita aqui no banco e não é devolvida ao app.

-- Quem pode consultar os registros de qualidade (portal "qualidade" ou app "app_qualidade_laminacao" com Ver).
-- Sem security definer: user_module_permissions já deixa cada usuário ler as próprias linhas.
create or replace function public.pode_ver_qualidade()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select public.is_admin()
    or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = auth.uid()
         and m.slug in ('qualidade', 'app_qualidade_laminacao')
         and ump.can_view
    );
$function$;

-- Quem pode registrar (Ações no módulo do app).
create or replace function public.pode_registrar_qualidade_laminacao()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select public.is_admin()
    or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = auth.uid()
         and m.slug = 'app_qualidade_laminacao'
         and ump.can_actions
    );
$function$;

revoke execute on function public.pode_ver_qualidade() from public, anon;
revoke execute on function public.pode_registrar_qualidade_laminacao() from public, anon;
grant execute on function public.pode_ver_qualidade() to authenticated;
grant execute on function public.pode_registrar_qualidade_laminacao() to authenticated;

create table public.qualidade_laminacao_rq03 (
  id uuid primary key,
  bpl_id integer not null,
  created_at timestamp with time zone not null default now(),
  responsavel_id uuid references public.app_apontadores (id),
  responsavel_nome text not null,
  tablet_user_id uuid not null references auth.users (id),
  -- Um jsonb por tipo: { "padrao": n, "itens": [ { "indice": n, "medidas": [ { ponto, valor, desvio, status, foto, foto_em } ] } ] }
  -- "indice" = corpo de prova (1..4) ou rolete (1..4). Em esquadro/temperatura "padrao" é o limite fixo (3,00 / 40).
  comprimento jsonb not null,
  largura jsonb not null,
  espessura jsonb not null,
  esquadro jsonb not null,
  temperatura_roletes jsonb not null,
  status text not null check (status in ('OK', 'ALERTA', 'PROBLEMA')),
  qtd_ok integer not null,
  qtd_alerta integer not null,
  qtd_problema integer not null,
  resumo jsonb not null
);

create index qualidade_laminacao_rq03_bpl_data_idx on public.qualidade_laminacao_rq03 (bpl_id, created_at desc);
create index qualidade_laminacao_rq03_status_idx on public.qualidade_laminacao_rq03 (status) where status <> 'OK';

alter table public.qualidade_laminacao_rq03 enable row level security;
revoke insert, update, delete on public.qualidade_laminacao_rq03 from anon, authenticated;

create policy "Quem tem acesso a Qualidade pode ver o RQ03"
  on public.qualidade_laminacao_rq03 for select
  to authenticated
  using (public.pode_ver_qualidade());

-- Fotos: bucket privado, só JPEG, até 1 MB cada. Sem policy de update/delete (foto enviada não muda).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qualidade-fotos', 'qualidade-fotos', false, 1048576, array['image/jpeg']);

create policy "Qualidade envia fotos do RQ03"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'qualidade-fotos'
    and (storage.foldername(name))[1] = 'rq03'
    and public.pode_registrar_qualidade_laminacao()
  );

create policy "Qualidade vê fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'qualidade-fotos' and public.pode_ver_qualidade());

-- Regra de status de uma medida (única fonte da regra).
--   comprimento/largura/espessura: |valor - padrão| < 0,02 OK; = 0,02 ALERTA; > 0,02 PROBLEMA
--   esquadro (cm): < 3,00 OK; = 3,00 ALERTA; > 3,00 PROBLEMA
--   temperatura: > 40 OK; = 40 ALERTA; < 40 PROBLEMA
create or replace function public.rq03_status_medida(p_tipo text, p_valor numeric, p_padrao numeric)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_tipo = 'temperatura' then
      case when p_valor < 40 then 'PROBLEMA' when p_valor = 40 then 'ALERTA' else 'OK' end
    when p_tipo = 'esquadro' then
      case when p_valor > 3.00 then 'PROBLEMA' when p_valor = 3.00 then 'ALERTA' else 'OK' end
    else
      case when abs(p_valor - p_padrao) > 0.02 then 'PROBLEMA' when abs(p_valor - p_padrao) = 0.02 then 'ALERTA' else 'OK' end
  end;
$function$;

revoke execute on function public.rq03_status_medida(text, numeric, numeric) from public, anon, authenticated;

-- Grava um apontamento do RQ03. p_dados:
--   { "padroes": {"comprimento": 2.60, "largura": 1.30, "espessura": 2.50},
--     "comprimento": [ [ {"valor":2.61,"foto_em":"<iso>"}, {...} ] x4 corpos ],  (idem largura, espessura)
--     "esquadro":    [ [ {...} ] x4 corpos ],
--     "temperatura": [ [ {...}, {...} ] x4 roletes ] }
-- As fotos já devem estar no bucket em rq03/<filial>/<id>/<tipo>-<indice>-<ponto>.jpg (a função confere).
-- Devolve {"status":"OK","id":...,"ja_existia":bool} ou {"status":"PIN_INVALIDO"} (não lança erro no PIN
-- inválido para não desfazer o registro da tentativa errada, ver DESAFIOS.md).
create or replace function public.registrar_rq03_laminacao(
  p_pin text,
  p_bpl_id integer,
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

        v_path := format('rq03/%s/%s/%s-%s-%s.jpg', p_bpl_id, p_id, v_tipo, v_idx, v_pt);
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
    id, bpl_id, responsavel_id, responsavel_nome, tablet_user_id,
    comprimento, largura, espessura, esquadro, temperatura_roletes,
    status, qtd_ok, qtd_alerta, qtd_problema, resumo
  ) values (
    p_id, p_bpl_id, v_resp.id, v_resp.nome_completo, v_uid,
    v_res -> 'comprimento', v_res -> 'largura', v_res -> 'espessura', v_res -> 'esquadro', v_res -> 'temperatura',
    v_geral, v_tot_ok, v_tot_alerta, v_tot_problema,
    jsonb_build_object('ok', v_tot_ok, 'alerta', v_tot_alerta, 'problema', v_tot_problema, 'por_tipo', v_por_tipo)
  );

  return jsonb_build_object('status', 'OK', 'id', p_id, 'ja_existia', false);
end;
$function$;

revoke execute on function public.registrar_rq03_laminacao(text, integer, uuid, jsonb) from public, anon;
grant execute on function public.registrar_rq03_laminacao(text, integer, uuid, jsonb) to authenticated;
