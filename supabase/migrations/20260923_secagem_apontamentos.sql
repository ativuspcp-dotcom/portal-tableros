-- Apontamentos de produção de secagem (chão de fábrica). Espelha o padrão de `amarracoes`:
-- tabela "solta" (sem prefixo pcp_ por consistência com a irmã amarracoes), FK op_id para o
-- setup ativo no momento (pcp_op_secagem), responsavel_id/tablet_user_id iguais a amarracoes.
--
-- Campos ainda pendentes de regra de negócio (o usuário vai passar depois — ver DESAFIOS.md):
-- cod_item/item (cruzamento com SAP Service Layer), modo_cubagem (lista dinâmica),
-- desconto (regra dinâmica) e total (fórmula). Todos nullable por ora.
create table public.secagem_apontamentos (
  id uuid primary key default gen_random_uuid(),
  data_apontamento timestamp with time zone not null default now(),
  qrcode text unique,
  data_producao date not null default current_date,
  local text not null,
  turno text not null,
  modo text not null,
  especie text not null,
  bitola numeric not null,
  cod_item text,
  item text,
  modo_cubagem text,
  altura_pecas numeric not null,
  desconto integer not null default 0,
  total numeric,
  local_estoque text not null check (local_estoque in ('CONSUMIR', 'RESSECAR', 'MERCADO INTERNO')),
  endereco text not null check (endereco ~ '^PILHA ([1-9]|[12][0-9]|30)$'),
  saida boolean not null default false,
  responsavel_id uuid references public.app_apontadores(id),
  responsavel_nome text,
  tablet_user_id uuid references auth.users(id),
  op_id uuid references public.pcp_op_secagem(id),
  created_at timestamp with time zone not null default now()
);

create index secagem_apontamentos_op_id_idx on public.secagem_apontamentos (op_id);
create index secagem_apontamentos_data_producao_idx on public.secagem_apontamentos (data_producao desc);

alter table public.secagem_apontamentos enable row level security;

create policy "Usuários autenticados podem ver apontamentos de secagem"
  on public.secagem_apontamentos for select
  to authenticated
  using (true);

create policy "Usuários autenticados podem inserir apontamentos de secagem"
  on public.secagem_apontamentos for insert
  to authenticated
  with check (true);

create policy "Usuários autenticados podem atualizar apontamentos de secagem"
  on public.secagem_apontamentos for update
  to authenticated
  using (true);

create policy "Usuários autenticados podem deletar apontamentos de secagem"
  on public.secagem_apontamentos for delete
  to authenticated
  using (true);

-- QRCode "LS<ano2digitos>-<sequencial>", com o sequencial reiniciando sozinho a cada virada de
-- ano (diferente do padrão hardcoded "AMA26-" usado em amarracoes, que precisa edição manual
-- todo ano — ver DESAFIOS.md). O contador por ano fica em pcp_secagem_qrcode_seq; o upsert com
-- RETURNING é atômico, então tablets gravando ao mesmo tempo não colidem no número.
create table public.pcp_secagem_qrcode_seq (
  ano integer primary key,
  ultimo integer not null default 0
);

create or replace function public.gerar_qrcode_secagem()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_ano integer := extract(year from now())::integer % 100;
  v_num integer;
begin
  if new.qrcode is null or new.qrcode = '' then
    insert into public.pcp_secagem_qrcode_seq (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.pcp_secagem_qrcode_seq.ultimo + 1
      returning ultimo into v_num;
    new.qrcode := 'LS' || lpad(v_ano::text, 2, '0') || '-' || v_num;
  end if;
  return new;
end;
$function$;

create trigger gerar_qrcode_secagem_trg
  before insert on public.secagem_apontamentos
  for each row execute function public.gerar_qrcode_secagem();

-- Agora que a tabela de apontamentos existe, a checagem de "OP zerada" em salvar_setup_secador
-- vira uma verificação real (antes sempre assumia true — ver migração 20260919_secadores_setup_rpc.sql).
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
    v_zerada := not exists (select 1 from public.secagem_apontamentos where op_id = v_atual.id);
    if v_zerada then
      delete from public.pcp_op_secagem where id = v_atual.id;
    else
      update public.pcp_op_secagem set status = 'Encerrada', encerrada_at = now() where id = v_atual.id;
    end if;
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

update public.modules set name = 'Produção Secagem' where slug = 'app_secagem';
