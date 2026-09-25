-- SERRA 1 e SERRA 2 (2026-09-25): a Serra deixa de ser única por filial e passa ao mesmo padrão dos
-- secadores (FEZER/OMECO): várias serras por filial (pcp_serras: bpl_id + nome), uma OP ativa POR SERRA,
-- medidas e regras de apontamento separadas por serra (pcp_secagem_setup_medidas / pcp_secagem_regras_cubagem
-- com secador = nome da serra) e código da OP SR<filial>-<seq> sequencial por filial (compartilhado entre as
-- duas serras, como SC entre FEZER e OMECO).
--
-- Dados existentes (a "SERRA" única): OP ativa SR1-1, 3 medidas e 4 regras viram SERRA 1. A SERRA 2 nasce vazia.

-- pcp_serras: de "uma linha por filial" (PK bpl_id) para (id, bpl_id, nome), igual pcp_secadores.
alter table public.pcp_op_serra drop constraint pcp_op_serra_bpl_id_fkey;
alter table public.pcp_serras drop constraint pcp_serras_pkey;
alter table public.pcp_serras add column id uuid not null default gen_random_uuid();
alter table public.pcp_serras add column nome text;
update public.pcp_serras set nome = 'SERRA 1';
alter table public.pcp_serras alter column nome set not null;
alter table public.pcp_serras add primary key (id);
alter table public.pcp_serras add constraint pcp_serras_bpl_nome_key unique (bpl_id, nome);
insert into public.pcp_serras (bpl_id, nome) values (1, 'SERRA 2');

-- OP da Serra passa a saber de qual serra é.
alter table public.pcp_op_serra add column serra text;
update public.pcp_op_serra set serra = 'SERRA 1';
alter table public.pcp_op_serra alter column serra set not null;
alter table public.pcp_op_serra
  add constraint pcp_op_serra_serra_fkey foreign key (bpl_id, serra) references public.pcp_serras (bpl_id, nome);
drop index public.pcp_op_serra_ativa_unica_idx;
create unique index pcp_op_serra_ativa_unica_idx on public.pcp_op_serra (serra, bpl_id) where status = 'Ativa';

-- Apontamento: "local" passa a guardar o nome da serra (antes era sempre 'SERRA').
update public.serra_apontamentos set local = 'SERRA 1' where local = 'SERRA';
alter table public.serra_apontamentos alter column local drop default;

-- Medidas e regras existentes da "SERRA" viram SERRA 1.
update public.pcp_secagem_setup_medidas set secador = 'SERRA 1' where secador = 'SERRA';
update public.pcp_secagem_regras_cubagem set secador = 'SERRA 1' where secador = 'SERRA';

-- salvar_setup_serra agora recebe a serra (a versão antiga, sem p_serra, sai).
drop function public.salvar_setup_serra(text, text, text, numeric, text, integer);

create or replace function public.salvar_setup_serra(
  p_serra text,
  p_pin text,
  p_tipo text,
  p_especie text,
  p_bitola numeric,
  p_turno text,
  p_bpl_id integer
)
returns setof public.pcp_op_serra
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_filiais jsonb;
  v_ok boolean;
  v_resp record;
  v_atual public.pcp_op_serra;
  v_tinha_atual boolean;
  v_zerada boolean;
  v_ultimo_codigo text;
  v_num integer;
  v_novo public.pcp_op_serra;
begin
  if v_uid is null then
    raise exception 'NAO_AUTENTICADO' using errcode = '28000';
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = v_uid
         and m.slug in ('app_setup_serra', 'pcp')
         and ump.can_actions
    )
  ) then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select coalesce(nullif(up.filiais_permitidas, '[]'::jsonb), '[1]'::jsonb)
    into v_filiais
    from public.user_profiles up
   where up.id = v_uid;

  if v_filiais is null or p_bpl_id is null or not (v_filiais @> to_jsonb(p_bpl_id)) then
    raise exception 'FILIAL_NAO_PERMITIDA' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.pcp_serras s
     where s.bpl_id = p_bpl_id and s.nome = p_serra and s.ativo
  ) then
    raise exception 'SERRA_INEXISTENTE' using errcode = '22023';
  end if;

  -- Tipo/espécie/bitola/turno: mesmas listas dos secadores; também existem no portal (op/serra.js) e no
  -- app (setup-serra.js). Sem comprimento/largura: são informados no apontamento.
  v_ok := p_tipo = 'PRODUÇÃO'
    and p_especie in ('PINUS', 'EUCALIPTO')
    and p_turno in ('00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00')
    and p_bitola in (1.5, 1.8, 2.2, 2.5, 2.7, 3.1, 3.3);

  if v_ok is not true then
    raise exception 'SETUP_INVALIDO' using errcode = '22023';
  end if;

  select r.id, r.nome_completo into v_resp from public.validar_pin(p_pin) r;
  if not found then
    -- PIN inválido: devolve vazio (não lançar erro) para não desfazer o registro da tentativa errada.
    return;
  end if;

  -- Lock por filial (não por serra): o código da OP é sequencial por filial, compartilhado entre as serras.
  perform pg_advisory_xact_lock(hashtext('setup_serra_codigo:' || p_bpl_id));

  select * into v_atual
    from public.pcp_op_serra
   where bpl_id = p_bpl_id and serra = p_serra and status = 'Ativa';
  v_tinha_atual := found;

  if v_tinha_atual
     and v_atual.tipo = p_tipo and v_atual.especie = p_especie
     and v_atual.bitola = p_bitola and v_atual.turno = p_turno then
    return next v_atual;
    return;
  end if;

  if v_tinha_atual then
    v_zerada := not exists (select 1 from public.serra_apontamentos where op_id = v_atual.id);
    if v_zerada then
      delete from public.pcp_op_serra where id = v_atual.id;
    else
      update public.pcp_op_serra set status = 'Encerrada', encerrada_at = now() where id = v_atual.id;
    end if;
  end if;

  select codigo_op into v_ultimo_codigo
    from public.pcp_op_serra
   where bpl_id = p_bpl_id and codigo_op is not null
   order by created_at desc
   limit 1;

  v_num := 1;
  if v_ultimo_codigo is not null then
    v_num := coalesce(nullif(split_part(v_ultimo_codigo, '-', 2), '')::integer, 0) + 1;
  end if;

  insert into public.pcp_op_serra (
    bpl_id, serra, codigo_op, tipo, especie, bitola, turno,
    status, created_by, responsavel_id, responsavel_nome
  ) values (
    p_bpl_id, p_serra,
    'SR' || p_bpl_id || '-' || v_num,
    p_tipo, p_especie, p_bitola, p_turno,
    'Ativa', v_uid, v_resp.id, v_resp.nome_completo
  )
  returning * into v_novo;

  return next v_novo;
end;
$function$;

revoke execute on function public.salvar_setup_serra(text, text, text, text, numeric, text, integer) from public, anon;
grant execute on function public.salvar_setup_serra(text, text, text, text, numeric, text, integer) to authenticated;
