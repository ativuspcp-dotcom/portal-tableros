-- Secadores pertencem a uma filial: a identidade é (bpl_id, nome), pois o mesmo nome pode existir em filiais diferentes.
-- FEZER e OMECO são da filial 1. Para cadastrar um secador em outra filial: insert em pcp_secadores
-- (e, se as regras de preenchimento forem novas, acrescentar nos 3 lugares descritos em DESAFIOS.md).

create table public.pcp_secadores (
  id uuid primary key default gen_random_uuid(),
  bpl_id integer not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  constraint pcp_secadores_bpl_nome_key unique (bpl_id, nome)
);

alter table public.pcp_secadores enable row level security;

create policy "Usuários autenticados podem ver secadores"
  on public.pcp_secadores for select
  to authenticated
  using (true);

insert into public.pcp_secadores (bpl_id, nome) values (1, 'FEZER'), (1, 'OMECO');

-- Uma OP só pode existir para um secador cadastrado naquela filial.
alter table public.pcp_op_secagem
  add constraint pcp_op_secagem_secador_fkey
  foreign key (bpl_id, secador) references public.pcp_secadores (bpl_id, nome);

alter table public.pcp_op_secagem drop constraint pcp_op_secagem_secador_check;

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
         and ((m.slug = 'app_setup_secadores' and ump.can_view)
           or (m.slug = 'pcp' and (ump.can_edit or ump.can_create)))
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
