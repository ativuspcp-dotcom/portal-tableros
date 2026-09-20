-- Permissões por módulo passam a ter só 2 opções: Ver (can_view) e Ações (can_actions = criar + editar + excluir).
-- FASE 1 (esta migração): adiciona can_actions preenchida a partir das colunas antigas e mantém as antigas até
-- o portal novo estar no ar. FASE 2 (depois do deploy): remover trigger + can_create/can_edit/can_delete
-- e tirar o espelhamento de campos legados em users.js (createUser) — ver DESAFIOS.md.

alter table public.user_module_permissions
  add column if not exists can_actions boolean not null default false;

update public.user_module_permissions
   set can_actions = (can_create or can_edit or can_delete);

-- Transição: linhas gravadas pelo código antigo (portal antigo / edge function create-user) só preenchem as
-- colunas legadas; aqui elas viram can_actions. O portal novo grava só can_actions (legadas ficam false).
create or replace function public.derivar_can_actions()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.can_actions := new.can_actions or new.can_create or new.can_edit or new.can_delete;
  return new;
end;
$function$;

drop trigger if exists derivar_can_actions_trg on public.user_module_permissions;
create trigger derivar_can_actions_trg
  before insert on public.user_module_permissions
  for each row execute function public.derivar_can_actions();

-- salvar_setup_secador: alterar setup exige "Ações" (no módulo do app ou no PCP do portal).
create or replace function public.salvar_setup_secador(
  p_secador text,
  p_pin text,
  p_tipo text,
  p_especie text,
  p_largura numeric,
  p_comprimento numeric,
  p_bitola numeric,
  p_turno text,
  p_bpl_id integer
)
returns setof public.pcp_op_secagem
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_filiais jsonb;
  v_ok boolean;
  v_resp record;
  v_atual public.pcp_op_secagem;
  v_tinha_atual boolean;
  v_novo public.pcp_op_secagem;
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
         and m.slug in ('app_setup_secadores', 'pcp')
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
    select 1 from public.pcp_secadores s
     where s.bpl_id = p_bpl_id and s.nome = p_secador and s.ativo
  ) then
    raise exception 'SECADOR_INEXISTENTE' using errcode = '22023';
  end if;

  -- Regras de preenchimento por secador (por nome). Também existem no portal (SECADOR_CONFIG em
  -- pages/op/secagem.js) e no app-operacional (CONFIG em setup-secadores.js): alterar nos 3 lugares.
  v_ok := p_secador in ('FEZER', 'OMECO')
    and p_tipo in ('PRODUÇÃO', 'RESSEQUE')
    and p_especie in ('PINUS', 'EUCALIPTO')
    and p_turno in ('00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00')
    and p_bitola in (1.5, 1.8, 2.0, 2.2, 2.5, 2.7, 3.1, 3.3)
    and (
      (p_secador = 'FEZER' and p_largura = 2.6 and p_comprimento in (1.3, 0.87))
      or (p_secador = 'OMECO' and (
            (p_largura = 2.6 and p_comprimento in (1.3, 0.87))
         or (p_largura = 1.3 and p_comprimento = 0.87)))
    );

  if v_ok is not true then
    raise exception 'SETUP_INVALIDO' using errcode = '22023';
  end if;

  select r.id, r.nome_completo into v_resp from public.validar_pin(p_pin) r;
  if not found then
    -- PIN inválido: devolve vazio em vez de lançar erro, senão o rollback desfaria o registro
    -- da tentativa errada feito por validar_pin (que alimenta o bloqueio por excesso de tentativas).
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('setup_secador:' || p_secador || ':' || p_bpl_id));

  select * into v_atual
    from public.pcp_op_secagem
   where secador = p_secador and bpl_id = p_bpl_id and status = 'Ativa';
  v_tinha_atual := found;

  if v_tinha_atual
     and v_atual.tipo = p_tipo and v_atual.especie = p_especie
     and v_atual.largura = p_largura and v_atual.comprimento = p_comprimento
     and v_atual.bitola = p_bitola and v_atual.turno = p_turno then
    return next v_atual;
    return;
  end if;

  if v_tinha_atual then
    -- Ainda não existem apontamentos de secagem: toda OP ativa está zerada e é excluída.
    -- Quando a tabela de apontamentos existir, OPs com produção devem ser encerradas
    -- (status = 'Encerrada', encerrada_at = now()) em vez de excluídas.
    delete from public.pcp_op_secagem where id = v_atual.id;
  end if;

  insert into public.pcp_op_secagem (
    bpl_id, secador, codigo_op, tipo, especie, largura, comprimento, bitola, turno,
    status, created_by, responsavel_id, responsavel_nome
  ) values (
    p_bpl_id, p_secador,
    'SEC-' || p_secador || '-' || lpad(nextval('public.pcp_op_secagem_codigo_seq')::text, 4, '0'),
    p_tipo, p_especie, p_largura, p_comprimento, p_bitola, p_turno,
    'Ativa', v_uid, v_resp.id, v_resp.nome_completo
  )
  returning * into v_novo;

  return next v_novo;
end;
$function$;
