-- Medidas de setup (comprimento x largura) válidas por secador, agora em tabela editável em
-- Configurações > PCP > Secagem. Substitui a lista fixa que existia em 3 lugares (função
-- salvar_setup_secador, SECADOR_CONFIG do portal e CONFIG do app-operacional).
-- Chaveada pelo nome do secador (igual pcp_secagem_regras_cubagem), vale para qualquer filial.
create table public.pcp_secagem_setup_medidas (
  id uuid primary key default gen_random_uuid(),
  secador text not null,
  comprimento numeric not null check (comprimento > 0 and comprimento <= 10),
  largura numeric not null check (largura > 0 and largura <= 10),
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  unique (secador, comprimento, largura)
);

alter table public.pcp_secagem_setup_medidas enable row level security;

create policy "Usuários autenticados podem ver medidas de setup da secagem"
  on public.pcp_secagem_setup_medidas for select
  to authenticated
  using (true);

create policy "Admins podem gerenciar medidas de setup da secagem"
  on public.pcp_secagem_setup_medidas for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.pcp_secagem_setup_medidas (secador, comprimento, largura) values
  ('FEZER', 2.6, 1.3),
  ('FEZER', 2.6, 0.87),
  ('OMECO', 2.6, 1.3),
  ('OMECO', 2.6, 0.87),
  ('OMECO', 1.3, 0.87);

-- Não deixa excluir uma medida que ainda tem regras de apontamento (ficariam órfãs): o caminho é
-- desativar (ativo = false) ou apagar as regras antes.
create or replace function public.pcp_secagem_setup_medidas_bloqueia_exclusao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.pcp_secagem_regras_cubagem r
     where r.secador = old.secador
       and r.comprimento_setup = old.comprimento
       and r.largura_setup = old.largura
  ) then
    raise exception 'MEDIDA_COM_REGRAS' using errcode = '23503';
  end if;
  return old;
end;
$function$;

revoke execute on function public.pcp_secagem_setup_medidas_bloqueia_exclusao() from public, anon, authenticated;

create trigger pcp_secagem_setup_medidas_bloqueia_exclusao
  before delete on public.pcp_secagem_setup_medidas
  for each row execute function public.pcp_secagem_setup_medidas_bloqueia_exclusao();

-- salvar_setup_secador: a validação de comprimento/largura passa a consultar a tabela acima.
-- Tipo, espécie, bitola e turno continuam fixos aqui e nos dois fronts (portal e app).
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
  v_zerada boolean;
  v_ultimo_codigo text;
  v_num integer;
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

  -- Tipo/espécie/bitola/turno: também existem no portal (pages/op/secagem.js) e no app
  -- (setup-secadores.js). Comprimento/largura vêm da tabela pcp_secagem_setup_medidas.
  v_ok := p_tipo in ('PRODUÇÃO', 'RESSEQUE')
    and p_especie in ('PINUS', 'EUCALIPTO')
    and p_turno in ('00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00')
    and p_bitola in (1.5, 1.8, 2.0, 2.2, 2.5, 2.7, 3.1, 3.3)
    and exists (
      select 1 from public.pcp_secagem_setup_medidas m
       where m.secador = p_secador
         and m.comprimento = p_comprimento
         and m.largura = p_largura
         and m.ativo
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

  -- Lock por filial (não por secador): o código da OP é sequencial por filial, compartilhado
  -- entre os secadores, então todos precisam serializar aqui para não colidir no número.
  perform pg_advisory_xact_lock(hashtext('setup_secador_codigo:' || p_bpl_id));

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
    v_zerada := not exists (select 1 from public.secagem_apontamentos where op_id = v_atual.id);
    if v_zerada then
      delete from public.pcp_op_secagem where id = v_atual.id;
    else
      update public.pcp_op_secagem set status = 'Encerrada', encerrada_at = now() where id = v_atual.id;
    end if;
  end if;

  select codigo_op into v_ultimo_codigo
    from public.pcp_op_secagem
   where bpl_id = p_bpl_id and codigo_op is not null
   order by created_at desc
   limit 1;

  v_num := 1;
  if v_ultimo_codigo is not null then
    v_num := coalesce(nullif(split_part(v_ultimo_codigo, '-', 2), '')::integer, 0) + 1;
  end if;

  insert into public.pcp_op_secagem (
    bpl_id, secador, codigo_op, tipo, especie, largura, comprimento, bitola, turno,
    status, created_by, responsavel_id, responsavel_nome
  ) values (
    p_bpl_id, p_secador,
    'SE' || p_bpl_id || '-' || v_num,
    p_tipo, p_especie, p_largura, p_comprimento, p_bitola, p_turno,
    'Ativa', v_uid, v_resp.id, v_resp.nome_completo
  )
  returning * into v_novo;

  return next v_novo;
end;
$function$;
