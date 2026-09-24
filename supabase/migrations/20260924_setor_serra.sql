-- Setor SERRA (2026-09-24). Ver PLANO_SERRA.md na raiz do projeto.
--
-- 1) Secagem: prefixo do código da OP passa de "SE" para "SC" (SC1-1). Renomeia as OPs existentes.
-- 2) Serra: uma única serra por filial (pcp_serras), OP (pcp_op_serra, código SR<filial>-<seq>),
--    apontamentos (serra_apontamentos, QR Code LS<yy>-<n> compartilhado com a secagem),
--    função salvar_setup_serra (PIN + permissão + filial, mesmo padrão de salvar_setup_secador)
--    e módulos de permissão do app.
-- Medidas (comprimento x largura) e regras de Opção da Serra reutilizam as tabelas da secagem
-- (pcp_secagem_setup_medidas / pcp_secagem_regras_cubagem) com secador = 'SERRA'; na Serra as colunas
-- "setup" guardam a medida escolhida no apontamento. Começam vazias (cadastradas em Configurações).

-- ============ 1) SE -> SC na secagem ============
update public.pcp_op_secagem set codigo_op = 'SC' || substr(codigo_op, 3) where codigo_op like 'SE%';

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

  v_ok := p_tipo in ('PRODUÇÃO', 'RESSEQUE')
    and p_especie in ('PINUS', 'EUCALIPTO')
    and p_turno in ('00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00')
    and p_bitola in (1.5, 1.8, 2.2, 2.5, 2.7, 3.1, 3.3)
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
    'SC' || p_bpl_id || '-' || v_num,
    p_tipo, p_especie, p_largura, p_comprimento, p_bitola, p_turno,
    'Ativa', v_uid, v_resp.id, v_resp.nome_completo
  )
  returning * into v_novo;

  return next v_novo;
end;
$function$;

-- ============ 2) Serra ============
-- Uma linha = a filial tem Serra (única por filial, sempre chamada SERRA). Só a filial 1 por enquanto.
create table public.pcp_serras (
  bpl_id integer primary key,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

alter table public.pcp_serras enable row level security;

create policy "Usuários autenticados podem ver serras"
  on public.pcp_serras for select
  to authenticated
  using (true);

insert into public.pcp_serras (bpl_id) values (1);

-- OP da Serra: setup sem comprimento/largura (definidos só no apontamento). Só é gravada por
-- salvar_setup_serra (sem policies de escrita).
create table public.pcp_op_serra (
  id uuid primary key default gen_random_uuid(),
  bpl_id integer not null references public.pcp_serras (bpl_id),
  codigo_op text unique,
  tipo text not null check (tipo = 'PRODUÇÃO'),
  especie text not null check (especie in ('PINUS', 'EUCALIPTO')),
  bitola numeric not null,
  turno text not null check (turno in ('00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00')),
  status text not null default 'Ativa' check (status in ('Ativa', 'Encerrada')),
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  encerrada_at timestamp with time zone,
  responsavel_id uuid,
  responsavel_nome text
);

create unique index pcp_op_serra_ativa_unica_idx on public.pcp_op_serra (bpl_id) where status = 'Ativa';
create index pcp_op_serra_bpl_idx on public.pcp_op_serra (bpl_id, created_at desc);

alter table public.pcp_op_serra enable row level security;

create policy "Usuários autenticados podem ver ops de serra"
  on public.pcp_op_serra for select
  to authenticated
  using (true);

-- Apontamentos da Serra: igual ao da secagem, mas comprimento/largura são informados no apontamento
-- e Local Estoque tem outras opções.
create table public.serra_apontamentos (
  id uuid primary key default gen_random_uuid(),
  data_apontamento timestamp with time zone not null default now(),
  qrcode text unique,
  data_producao date not null default current_date,
  local text not null default 'SERRA',
  turno text not null,
  modo text not null,
  especie text not null,
  bitola numeric not null,
  cod_item text,
  item text,
  modo_cubagem text,
  comprimento numeric not null,
  largura numeric not null,
  altura_pecas numeric not null,
  desconto integer not null default 0,
  total numeric,
  local_estoque text not null check (local_estoque in ('CONSUMIR', 'MERCADO INTERNO')),
  endereco text not null check (endereco ~ '^PILHA ([1-9]|[12][0-9]|30)$'),
  saida boolean not null default false,
  responsavel_id uuid references public.app_apontadores(id),
  responsavel_nome text,
  tablet_user_id uuid references auth.users(id),
  op_id uuid references public.pcp_op_serra(id),
  created_at timestamp with time zone not null default now()
);

create index serra_apontamentos_op_id_idx on public.serra_apontamentos (op_id);
create index serra_apontamentos_data_producao_idx on public.serra_apontamentos (data_producao desc);

alter table public.serra_apontamentos enable row level security;

create policy "Usuários autenticados podem ver apontamentos de serra"
  on public.serra_apontamentos for select to authenticated using (true);
create policy "Usuários autenticados podem inserir apontamentos de serra"
  on public.serra_apontamentos for insert to authenticated with check (true);
create policy "Usuários autenticados podem atualizar apontamentos de serra"
  on public.serra_apontamentos for update to authenticated using (true);
create policy "Usuários autenticados podem deletar apontamentos de serra"
  on public.serra_apontamentos for delete to authenticated using (true);

-- QR Code: reaproveita a função/contador da secagem (LS<yy>-<n>), então os dois setores dividem a numeração.
create trigger gerar_qrcode_serra_trg
  before insert on public.serra_apontamentos
  for each row execute function public.gerar_qrcode_secagem();

-- Setup da Serra: mesmo padrão de salvar_setup_secador (PIN validado no servidor, permissão "Ações",
-- filial permitida, troca atômica da OP ativa). Código SR<filial>-<seq>.
create or replace function public.salvar_setup_serra(
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

  if not exists (select 1 from public.pcp_serras s where s.bpl_id = p_bpl_id and s.ativo) then
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

  perform pg_advisory_xact_lock(hashtext('setup_serra_codigo:' || p_bpl_id));

  select * into v_atual
    from public.pcp_op_serra
   where bpl_id = p_bpl_id and status = 'Ativa';
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
    bpl_id, codigo_op, tipo, especie, bitola, turno,
    status, created_by, responsavel_id, responsavel_nome
  ) values (
    p_bpl_id,
    'SR' || p_bpl_id || '-' || v_num,
    p_tipo, p_especie, p_bitola, p_turno,
    'Ativa', v_uid, v_resp.id, v_resp.nome_completo
  )
  returning * into v_novo;

  return next v_novo;
end;
$function$;

revoke execute on function public.salvar_setup_serra(text, text, text, numeric, text, integer) from public, anon;
grant execute on function public.salvar_setup_serra(text, text, text, numeric, text, integer) to authenticated;

-- Módulos de permissão do app (aparecem em Portal > Usuários, agrupados em "Serra").
-- app_serra já existia como placeholder "Serra (Operação)" (sem nenhuma permissão concedida): só renomeia.
update public.modules
   set name = 'Produção Serra', group_name = 'Serra', sort_order = 30
 where slug = 'app_serra';

insert into public.modules (name, slug, description, icon, is_active, sort_order, type, group_name) values
  ('Setup Serra', 'app_setup_serra', 'Setup da Serra', 'factory', true, 35, 'app', 'Serra');
