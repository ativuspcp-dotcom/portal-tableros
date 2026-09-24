-- Agentes de IA: tabelas agente_* e funções de escrita. RASCUNHO — ainda NÃO aplicado.
-- Desenho e justificativas: agentes/SCHEMA.md. Decisões: agentes/PLANO.md (D1–D9, N1–N4).
-- Quando aprovado, vira supabase/migrations/YYYYMMDD_agentes_base.sql e é aplicado via apply_migration.
--
-- O que esta migration garante:
--   * nenhuma policy using(true)/with check(true); leitura direta só admin (e o disparador nas próprias execuções);
--   * nenhuma policy de INSERT/UPDATE/DELETE: toda escrita passa por função security definer (D6);
--   * funções de bookkeeping do motor exigem o header x-agente-chave (segredo 'agente_motor_chave' no Vault),
--     para que um usuário logado não forje execuções/propostas chamando a RPC direto (D10);
--   * payload das propostas imutável, com hash conferido na execução (D4, D9-b), e transição atômica
--     pendente -> executando (D9-c); escrita_sensivel no máximo uma vez por execução (D9-b);
--   * notificação exige destinatário e assunto no log, com limite por execução (N2, N4).
--
-- PRÉ-REQUISITO: criar no Vault o segredo 'agente_motor_chave' (Dashboard > Vault) e a mesma chave como
-- secret AGENTE_MOTOR_CHAVE da edge function 'agente'. Sem ele, as funções do motor recusam (falha fechada).

-- ============================================================================
-- 1. Tabelas
-- ============================================================================

-- Cadastro dos agentes. slug = nome da pasta em agentes/<slug>/. Cadastro só por migration/SQL (sem RPC).
create table public.agentes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text not null,
  robo_user_id uuid unique references auth.users(id) on delete set null,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create trigger agentes_updated_at
  before update on public.agentes
  for each row execute function public.update_updated_at_column();

-- Log de execuções (substitui conversas/mensagens: não há chat). Uma linha por acionamento.
create table public.agente_execucoes (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes(id),
  tarefa text not null check (tarefa ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tipo text not null check (tipo in ('execucao_direta', 'pode_propor_acao')),
  modo text not null check (modo in ('usuario', 'robo')),
  modulo_exigido text,
  disparado_por uuid not null references auth.users(id),
  executado_como uuid not null references auth.users(id),
  entrada jsonb not null default '{}'::jsonb,
  entrada_hash text not null,
  chave_idempotencia uuid not null,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluida', 'falhou', 'expirada')),
  resultado jsonb,
  erro text,
  iteracoes integer not null default 0,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  created_at timestamp with time zone not null default now(),
  finalizada_em timestamp with time zone,
  constraint agente_execucoes_direta_so_usuario check (tipo <> 'execucao_direta' or modo = 'usuario'),
  constraint agente_execucoes_robo_exige_modulo check (modo <> 'robo' or modulo_exigido is not null),
  constraint agente_execucoes_chave_unica unique (agente_id, chave_idempotencia)
);

-- D9-c: duas execuções diretas da mesma tarefa com a mesma entrada não rodam ao mesmo tempo (clique duplo).
create unique index agente_execucoes_direta_em_andamento_uidx
  on public.agente_execucoes (agente_id, tarefa, entrada_hash)
  where status = 'em_andamento' and tipo = 'execucao_direta';
create index agente_execucoes_agente_idx on public.agente_execucoes (agente_id, created_at desc);
create index agente_execucoes_disparado_por_idx on public.agente_execucoes (disparado_por, created_at desc);

-- Cada chamada de ferramenta de uma execução (auditoria). leitura/recusada: gravada já concluída.
-- notificacao/escrita_sensivel: reservada ('executando') ANTES do efeito e concluída depois, para que o
-- limite e o "uma vez por execução" valham antes do efeito e o log exista mesmo se o motor cair no meio.
create table public.agente_execucao_chamadas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.agente_execucoes(id),
  ordem integer not null,
  ferramenta text not null,
  categoria text not null check (categoria in ('leitura', 'notificacao', 'escrita_sensivel')),
  argumentos jsonb not null default '{}'::jsonb,
  status text not null check (status in ('executando', 'ok', 'erro', 'recusada')),
  resultado jsonb,
  erro text,
  destinatario text,
  assunto text,
  conteudo_hash text,
  created_at timestamp with time zone not null default now(),
  finalizada_em timestamp with time zone,
  constraint agente_chamadas_ordem_unica unique (execucao_id, ordem),
  -- N4: notificação sempre registra destinatário e assunto.
  constraint agente_chamadas_notificacao_com_destino
    check (categoria <> 'notificacao' or status = 'recusada' or (destinatario is not null and assunto is not null))
);

-- D9-b: cada ferramenta escrita_sensivel roda no máximo uma vez por execução.
create unique index agente_chamadas_escrita_unica_uidx
  on public.agente_execucao_chamadas (execucao_id, ferramenta)
  where categoria = 'escrita_sensivel' and status <> 'recusada';

-- Fila de propostas de escrita sensível (tarefas pode_propor_acao). A decisão (aprovar/rejeitar) fica
-- na própria linha: cada ação é decidida uma única vez (D11 — substitui a tabela agente_aprovacoes).
create table public.agente_acoes (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes(id),
  execucao_id uuid not null references public.agente_execucoes(id),
  tarefa text not null,
  ferramenta text not null,
  argumentos jsonb not null,
  payload_hash text not null,
  justificativa text not null,
  bpl_id integer,
  status text not null default 'pendente'
    check (status in ('pendente', 'executando', 'executada', 'falhou', 'rejeitada')),
  expira_em timestamp with time zone not null default now() + interval '7 days',
  decidida_por uuid references auth.users(id),
  decidida_em timestamp with time zone,
  lote_id uuid,
  motivo_rejeicao text,
  resultado jsonb,
  erro text,
  created_at timestamp with time zone not null default now(),
  finalizada_em timestamp with time zone
);

-- A mesma proposta (mesma ferramenta + argumentos) não se acumula pendente (ex.: cron diário repetindo).
create unique index agente_acoes_pendente_unica_uidx
  on public.agente_acoes (agente_id, payload_hash)
  where status = 'pendente';
create index agente_acoes_pendentes_idx on public.agente_acoes (created_at) where status = 'pendente';

-- Memória do agente: lida ao vivo pelo motor (só 'aprovada'); nunca entra em bundle.
create table public.agente_memoria (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes(id),
  execucao_id uuid references public.agente_execucoes(id),
  conteudo text not null check (length(conteudo) between 1 and 2000),
  origem text not null check (origem in ('agente', 'humano')),
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'rejeitada', 'arquivada')),
  decidida_por uuid references auth.users(id),
  decidida_em timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index agente_memoria_aprovada_idx on public.agente_memoria (agente_id, created_at desc) where status = 'aprovada';

-- Skills que o agente propõe. Aprovada -> vira .md em agentes/<slug>/skills/ via PR -> 'incorporada'.
create table public.agente_skills_propostas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes(id),
  execucao_id uuid references public.agente_execucoes(id),
  nome text not null check (nome ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  descricao text not null,
  conteudo text not null check (length(conteudo) between 1 and 20000),
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'rejeitada', 'incorporada')),
  decidida_por uuid references auth.users(id),
  decidida_em timestamp with time zone,
  pr_url text,
  created_at timestamp with time zone not null default now(),
  constraint agente_skills_incorporada_tem_pr check (status <> 'incorporada' or pr_url is not null)
);

-- agente_documentos: adiada (D12 — depende da escolha do provedor de embeddings).

-- ============================================================================
-- 2. RLS e privilégios de tabela
-- ============================================================================

alter table public.agentes enable row level security;
alter table public.agente_execucoes enable row level security;
alter table public.agente_execucao_chamadas enable row level security;
alter table public.agente_acoes enable row level security;
alter table public.agente_memoria enable row level security;
alter table public.agente_skills_propostas enable row level security;

-- Só leitura via API; escrita nenhuma (nem com policy): tudo pelas funções abaixo.
revoke all on public.agentes, public.agente_execucoes, public.agente_execucao_chamadas,
  public.agente_acoes, public.agente_memoria, public.agente_skills_propostas
  from anon, authenticated;
grant select on public.agentes, public.agente_execucoes, public.agente_execucao_chamadas,
  public.agente_acoes, public.agente_memoria, public.agente_skills_propostas
  to authenticated;

create policy "Admin lê agentes"
  on public.agentes for select to authenticated
  using ((select public.is_admin()));

-- O disparador vê as próprias execuções (status/resultado para a tela que chamou o agente).
create policy "Admin ou disparador lê execuções"
  on public.agente_execucoes for select to authenticated
  using ((select public.is_admin()) or disparado_por = (select auth.uid()));

-- Chamadas podem conter dados lidos com o poder do robô: só admin.
create policy "Admin lê chamadas de ferramenta"
  on public.agente_execucao_chamadas for select to authenticated
  using ((select public.is_admin()));

create policy "Admin lê ações propostas"
  on public.agente_acoes for select to authenticated
  using ((select public.is_admin()));

create policy "Admin lê memória dos agentes"
  on public.agente_memoria for select to authenticated
  using ((select public.is_admin()));

create policy "Admin lê skills propostas"
  on public.agente_skills_propostas for select to authenticated
  using ((select public.is_admin()));

-- ============================================================================
-- 3. Helpers internos (sem EXECUTE para anon/authenticated; só as funções definer os chamam)
-- ============================================================================

create or replace function public.agente_hash(p_texto text)
returns text
language sql
immutable
set search_path to 'public', 'extensions'
as $function$
  select encode(extensions.digest(convert_to(p_texto, 'UTF8'), 'sha256'), 'hex');
$function$;

-- Hash do payload de uma proposta. jsonb::text é determinístico (chaves normalizadas).
create or replace function public.agente_hash_acao(p_ferramenta text, p_argumentos jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select public.agente_hash(p_ferramenta || E'\n' || p_argumentos::text);
$function$;

-- D10: só o motor (edge function 'agente') conhece a chave; RPC chamada direto por um usuário é recusada.
create or replace function public.agente_exigir_motor()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recebida text := nullif(current_setting('request.headers', true), '')::json ->> 'x-agente-chave';
  v_esperada text;
begin
  select ds.decrypted_secret into v_esperada
    from vault.decrypted_secrets ds
   where ds.name = 'agente_motor_chave';

  if v_esperada is null or v_recebida is null or v_recebida <> v_esperada then
    raise exception 'SOMENTE_MOTOR' using errcode = '42501';
  end if;
end;
$function$;

-- Execução em andamento do próprio chamador (âncora de isolamento: tudo o que o motor grava ou lê
-- é derivado do agente DESTA execução, nunca de um agente_id vindo como parâmetro).
create or replace function public.agente_execucao_ativa(p_execucao_id uuid)
returns public.agente_execucoes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
begin
  perform public.agente_exigir_motor();

  select * into v from public.agente_execucoes e where e.id = p_execucao_id for update;

  if not found
     or v.disparado_por is distinct from auth.uid()
     or v.status <> 'em_andamento'
     or v.created_at < now() - interval '10 minutes' then
    raise exception 'EXECUCAO_INVALIDA' using errcode = '42501';
  end if;

  return v;
end;
$function$;

-- ============================================================================
-- 4. Triggers de imutabilidade (defesa em profundidade, caso uma função tenha bug)
-- ============================================================================

create or replace function public.agente_execucoes_protege()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.agente_id, new.tarefa, new.tipo, new.modo, new.modulo_exigido, new.disparado_por,
      new.executado_como, new.entrada, new.entrada_hash, new.chave_idempotencia, new.created_at)
     is distinct from
     (old.agente_id, old.tarefa, old.tipo, old.modo, old.modulo_exigido, old.disparado_por,
      old.executado_como, old.entrada, old.entrada_hash, old.chave_idempotencia, old.created_at) then
    raise exception 'CAMPO_IMUTAVEL' using errcode = '42501';
  end if;
  if old.status <> 'em_andamento' then
    raise exception 'EXECUCAO_ENCERRADA' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger agente_execucoes_protege_trg
  before update on public.agente_execucoes
  for each row execute function public.agente_execucoes_protege();

create or replace function public.agente_chamadas_protege()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status <> 'executando'
     or new.status not in ('ok', 'erro')
     or (new.execucao_id, new.ordem, new.ferramenta, new.categoria, new.argumentos,
         new.destinatario, new.assunto, new.conteudo_hash, new.created_at)
        is distinct from
        (old.execucao_id, old.ordem, old.ferramenta, old.categoria, old.argumentos,
         old.destinatario, old.assunto, old.conteudo_hash, old.created_at) then
    raise exception 'CHAMADA_IMUTAVEL' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger agente_chamadas_protege_trg
  before update on public.agente_execucao_chamadas
  for each row execute function public.agente_chamadas_protege();

create or replace function public.agente_acoes_protege()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.agente_id, new.execucao_id, new.tarefa, new.ferramenta, new.argumentos, new.payload_hash,
      new.justificativa, new.bpl_id, new.expira_em, new.created_at)
     is distinct from
     (old.agente_id, old.execucao_id, old.tarefa, old.ferramenta, old.argumentos, old.payload_hash,
      old.justificativa, old.bpl_id, old.expira_em, old.created_at) then
    raise exception 'CAMPO_IMUTAVEL' using errcode = '42501';
  end if;
  if not ((old.status = 'pendente' and new.status in ('executando', 'rejeitada'))
       or (old.status = 'executando' and new.status in ('executada', 'falhou'))) then
    raise exception 'TRANSICAO_INVALIDA' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger agente_acoes_protege_trg
  before update on public.agente_acoes
  for each row execute function public.agente_acoes_protege();

-- ============================================================================
-- 5. Funções do motor (exigem x-agente-chave; chamadas com o JWT de quem disparou)
-- ============================================================================

create or replace function public.agente_iniciar_execucao(
  p_agente text,
  p_tarefa text,
  p_tipo text,
  p_modo text,
  p_modulo_exigido text,
  p_entrada jsonb,
  p_chave_idempotencia uuid
)
returns table (execucao_id uuid, agente_id uuid, executado_como uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_agente public.agentes;
  v_como uuid;
  v_entrada jsonb := coalesce(p_entrada, '{}'::jsonb);
  v_id uuid;
begin
  perform public.agente_exigir_motor();

  if v_uid is null then
    raise exception 'NAO_AUTENTICADO' using errcode = '28000';
  end if;

  -- D9-a (o CHECK da tabela repete a regra).
  if p_tipo = 'execucao_direta' and p_modo is distinct from 'usuario' then
    raise exception 'DIRETA_SO_MODO_USUARIO' using errcode = '22023';
  end if;

  select * into v_agente from public.agentes a where a.slug = p_agente and a.ativo;
  if not found then
    raise exception 'AGENTE_INEXISTENTE' using errcode = '22023';
  end if;

  if p_modo = 'robo' then
    -- D7: o chamador precisa ter o módulo exigido pela tarefa ANTES de a execução assumir o robô.
    if p_modulo_exigido is null then
      raise exception 'MODULO_EXIGIDO_AUSENTE' using errcode = '22023';
    end if;
    if not (public.is_admin() or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = v_uid
         and m.slug = p_modulo_exigido
         and m.is_active
         and ump.can_view
    )) then
      raise exception 'SEM_PERMISSAO' using errcode = '42501';
    end if;
    if v_agente.robo_user_id is null then
      raise exception 'ROBO_NAO_CONFIGURADO' using errcode = '22023';
    end if;
    v_como := v_agente.robo_user_id;
  else
    v_como := v_uid;
  end if;

  -- Execução abandonada (edge function caiu) não pode travar a tarefa para sempre.
  update public.agente_execucoes e
     set status = 'expirada', erro = 'TEMPO_ESGOTADO', finalizada_em = now()
   where e.agente_id = v_agente.id
     and e.status = 'em_andamento'
     and e.created_at < now() - interval '10 minutes';

  begin
    insert into public.agente_execucoes (
      agente_id, tarefa, tipo, modo, modulo_exigido, disparado_por, executado_como,
      entrada, entrada_hash, chave_idempotencia
    ) values (
      v_agente.id, p_tarefa, p_tipo, p_modo, p_modulo_exigido, v_uid, v_como,
      v_entrada, public.agente_hash(v_entrada::text), p_chave_idempotencia
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'EXECUCAO_DUPLICADA' using errcode = '23505';
  end;

  return query select v_id, v_agente.id, v_como;
end;
$function$;

create or replace function public.agente_carregar_memorias(p_execucao_id uuid)
returns table (id uuid, conteudo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  return query
    select m.id, m.conteudo
      from public.agente_memoria m
     where m.agente_id = v.agente_id and m.status = 'aprovada'
     order by m.created_at desc
     limit 100;
end;
$function$;

-- Leituras (já concluídas) e ferramentas recusadas pelo motor (qualquer categoria).
create or replace function public.agente_registrar_chamada(
  p_execucao_id uuid,
  p_ferramenta text,
  p_categoria text,
  p_status text,
  p_argumentos jsonb default '{}'::jsonb,
  p_resultado jsonb default null,
  p_erro text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
  v_id uuid;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  if not ((p_categoria = 'leitura' and p_status in ('ok', 'erro')) or p_status = 'recusada') then
    raise exception 'USE_RESERVAR_CHAMADA' using errcode = '22023';
  end if;

  insert into public.agente_execucao_chamadas (
    execucao_id, ordem, ferramenta, categoria, argumentos, status, resultado, erro, finalizada_em
  )
  select v.id, coalesce(max(c.ordem), 0) + 1, p_ferramenta, p_categoria, coalesce(p_argumentos, '{}'::jsonb),
         p_status, p_resultado, p_erro, now()
    from public.agente_execucao_chamadas c
   where c.execucao_id = v.id
  returning id into v_id;

  return v_id;
end;
$function$;

-- notificacao / escrita_sensivel: reserva ANTES do efeito. Aqui valem N2, D9-b e "escrita só em execução direta".
create or replace function public.agente_reservar_chamada(
  p_execucao_id uuid,
  p_ferramenta text,
  p_categoria text,
  p_argumentos jsonb,
  p_destinatario text default null,
  p_assunto text default null,
  p_conteudo_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
  v_id uuid;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  if p_categoria = 'escrita_sensivel' then
    if v.tipo <> 'execucao_direta' then
      raise exception 'TIPO_NAO_ESCREVE' using errcode = '42501';
    end if;
  elsif p_categoria = 'notificacao' then
    if (select count(*) from public.agente_execucao_chamadas c
         where c.execucao_id = v.id and c.categoria = 'notificacao' and c.status <> 'recusada') >= 20 then
      raise exception 'LIMITE_NOTIFICACOES' using errcode = '54000';
    end if;
  else
    raise exception 'CATEGORIA_SEM_RESERVA' using errcode = '22023';
  end if;

  begin
    insert into public.agente_execucao_chamadas (
      execucao_id, ordem, ferramenta, categoria, argumentos, status, destinatario, assunto, conteudo_hash
    )
    select v.id, coalesce(max(c.ordem), 0) + 1, p_ferramenta, p_categoria, coalesce(p_argumentos, '{}'::jsonb),
           'executando', p_destinatario, p_assunto, p_conteudo_hash
      from public.agente_execucao_chamadas c
     where c.execucao_id = v.id
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ESCRITA_JA_EXECUTADA' using errcode = '23505';
  end;

  return v_id;
end;
$function$;

create or replace function public.agente_concluir_chamada(
  p_chamada_id uuid,
  p_status text,
  p_resultado jsonb default null,
  p_erro text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_execucao_id uuid;
begin
  select c.execucao_id into v_execucao_id
    from public.agente_execucao_chamadas c
   where c.id = p_chamada_id and c.status = 'executando';
  if not found then
    raise exception 'CHAMADA_INVALIDA' using errcode = '42501';
  end if;

  perform public.agente_execucao_ativa(v_execucao_id);

  update public.agente_execucao_chamadas c
     set status = p_status, resultado = p_resultado, erro = p_erro, finalizada_em = now()
   where c.id = p_chamada_id;
end;
$function$;

create or replace function public.agente_propor_acao(
  p_execucao_id uuid,
  p_ferramenta text,
  p_argumentos jsonb,
  p_justificativa text,
  p_bpl_id integer default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
  v_hash text;
  v_id uuid;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  if v.tipo <> 'pode_propor_acao' then
    raise exception 'TIPO_NAO_PROPOE' using errcode = '42501';
  end if;
  if (select count(*) from public.agente_acoes a where a.execucao_id = v.id) >= 50 then
    raise exception 'LIMITE_PROPOSTAS' using errcode = '54000';
  end if;

  v_hash := public.agente_hash_acao(p_ferramenta, p_argumentos);

  insert into public.agente_acoes (
    agente_id, execucao_id, tarefa, ferramenta, argumentos, payload_hash, justificativa, bpl_id
  ) values (
    v.agente_id, v.id, v.tarefa, p_ferramenta, p_argumentos, v_hash, p_justificativa, p_bpl_id
  )
  on conflict (agente_id, payload_hash) where status = 'pendente' do nothing
  returning id into v_id;

  if v_id is null then
    select a.id into v_id
      from public.agente_acoes a
     where a.agente_id = v.agente_id and a.payload_hash = v_hash and a.status = 'pendente';
  end if;

  return v_id;
end;
$function$;

create or replace function public.agente_propor_memoria(p_execucao_id uuid, p_conteudo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
  v_id uuid;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  if (select count(*) from public.agente_memoria m where m.execucao_id = v.id) >= 10 then
    raise exception 'LIMITE_MEMORIAS' using errcode = '54000';
  end if;

  insert into public.agente_memoria (agente_id, execucao_id, conteudo, origem)
  values (v.agente_id, v.id, p_conteudo, 'agente')
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.agente_propor_skill(
  p_execucao_id uuid,
  p_nome text,
  p_descricao text,
  p_conteudo text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
  v_id uuid;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  if (select count(*) from public.agente_skills_propostas s where s.execucao_id = v.id) >= 3 then
    raise exception 'LIMITE_SKILLS' using errcode = '54000';
  end if;

  insert into public.agente_skills_propostas (agente_id, execucao_id, nome, descricao, conteudo)
  values (v.agente_id, v.id, p_nome, p_descricao, p_conteudo)
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.agente_finalizar_execucao(
  p_execucao_id uuid,
  p_status text,
  p_resultado jsonb default null,
  p_erro text default null,
  p_iteracoes integer default 0,
  p_tokens_entrada integer default 0,
  p_tokens_saida integer default 0
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.agente_execucoes;
begin
  v := public.agente_execucao_ativa(p_execucao_id);

  if p_status not in ('concluida', 'falhou') then
    raise exception 'STATUS_INVALIDO' using errcode = '22023';
  end if;

  update public.agente_execucoes e
     set status = p_status, resultado = p_resultado, erro = p_erro, iteracoes = p_iteracoes,
         tokens_entrada = p_tokens_entrada, tokens_saida = p_tokens_saida, finalizada_em = now()
   where e.id = v.id;
end;
$function$;

-- ============================================================================
-- 6. Aprovação de propostas (D4/D8). Executar exige admin + chave do motor: a execução real
--    acontece na edge function, com o JWT de quem aprovou. Rejeitar não tem efeito: portal chama direto.
-- ============================================================================

create or replace function public.agente_acao_iniciar_execucao(
  p_acao_id uuid,
  p_hash_visto text,
  p_lote_id uuid default null
)
returns table (acao_id uuid, agente text, tarefa text, ferramenta text, argumentos jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_acao public.agente_acoes;
  v_filiais jsonb;
begin
  perform public.agente_exigir_motor();

  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select * into v_acao from public.agente_acoes x where x.id = p_acao_id for update;
  if not found then
    raise exception 'ACAO_INEXISTENTE' using errcode = '22023';
  end if;
  -- D9-c: só sai de 'pendente' uma vez (clique duplo / retentativa / lote reenviado).
  if v_acao.status <> 'pendente' then
    raise exception 'ACAO_NAO_PENDENTE' using errcode = '42501';
  end if;
  if v_acao.expira_em <= now() then
    raise exception 'ACAO_EXPIRADA' using errcode = '42501';
  end if;
  -- D9-b: o payload é exatamente o gravado e exatamente o que o aprovador viu.
  if v_acao.payload_hash <> public.agente_hash_acao(v_acao.ferramenta, v_acao.argumentos)
     or v_acao.payload_hash is distinct from p_hash_visto then
    raise exception 'HASH_DIVERGENTE' using errcode = '42501';
  end if;
  -- D4-b: a filial da proposta tem de ser visível para quem aprova.
  if v_acao.bpl_id is not null then
    select coalesce(nullif(up.filiais_permitidas, '[]'::jsonb), '[1]'::jsonb) into v_filiais
      from public.user_profiles up
     where up.id = v_uid;
    if v_filiais is null or not (v_filiais @> to_jsonb(v_acao.bpl_id)) then
      raise exception 'FILIAL_NAO_PERMITIDA' using errcode = '42501';
    end if;
  end if;

  update public.agente_acoes x
     set status = 'executando', decidida_por = v_uid, decidida_em = now(), lote_id = p_lote_id
   where x.id = v_acao.id;

  return query
    select v_acao.id, g.slug, v_acao.tarefa, v_acao.ferramenta, v_acao.argumentos
      from public.agentes g
     where g.id = v_acao.agente_id;
end;
$function$;

create or replace function public.agente_acao_finalizar(
  p_acao_id uuid,
  p_ok boolean,
  p_resultado jsonb default null,
  p_erro text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.agente_exigir_motor();

  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  update public.agente_acoes x
     set status = case when p_ok then 'executada' else 'falhou' end,
         resultado = p_resultado, erro = p_erro, finalizada_em = now()
   where x.id = p_acao_id and x.status = 'executando' and x.decidida_por = auth.uid();

  if not found then
    raise exception 'ACAO_NAO_EXECUTANDO' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.agente_acoes_rejeitar(p_acao_ids uuid[], p_motivo text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_qtd integer;
  v_lote uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  update public.agente_acoes x
     set status = 'rejeitada', decidida_por = auth.uid(), decidida_em = now(),
         lote_id = v_lote, motivo_rejeicao = p_motivo
   where x.id = any (p_acao_ids) and x.status = 'pendente';
  get diagnostics v_qtd = row_count;

  return v_qtd;
end;
$function$;

-- ============================================================================
-- 7. Curadoria de memória e skills (D8: admin)
-- ============================================================================

-- pendente -> aprovada | rejeitada; aprovada -> arquivada.
create or replace function public.agente_memoria_decidir(p_ids uuid[], p_status text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_qtd integer;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;
  if p_status not in ('aprovada', 'rejeitada', 'arquivada') then
    raise exception 'STATUS_INVALIDO' using errcode = '22023';
  end if;

  update public.agente_memoria m
     set status = p_status, decidida_por = auth.uid(), decidida_em = now()
   where m.id = any (p_ids)
     and ((p_status in ('aprovada', 'rejeitada') and m.status = 'pendente')
       or (p_status = 'arquivada' and m.status = 'aprovada'));
  get diagnostics v_qtd = row_count;

  return v_qtd;
end;
$function$;

-- Memória escrita por um humano já nasce aprovada.
create or replace function public.agente_memoria_criar(p_agente text, p_conteudo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agente_id uuid;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select a.id into v_agente_id from public.agentes a where a.slug = p_agente;
  if not found then
    raise exception 'AGENTE_INEXISTENTE' using errcode = '22023';
  end if;

  insert into public.agente_memoria (agente_id, conteudo, origem, status, decidida_por, decidida_em)
  values (v_agente_id, p_conteudo, 'humano', 'aprovada', auth.uid(), now())
  returning id into v_id;

  return v_id;
end;
$function$;

-- pendente -> aprovada | rejeitada; aprovada -> incorporada (exige o link do PR que criou o .md).
create or replace function public.agente_skill_decidir(p_id uuid, p_status text, p_pr_url text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  update public.agente_skills_propostas s
     set status = p_status, decidida_por = auth.uid(), decidida_em = now(),
         pr_url = coalesce(p_pr_url, s.pr_url)
   where s.id = p_id
     and ((p_status in ('aprovada', 'rejeitada') and s.status = 'pendente')
       or (p_status = 'incorporada' and s.status = 'aprovada' and p_pr_url is not null));

  if not found then
    raise exception 'TRANSICAO_INVALIDA' using errcode = '22023';
  end if;
end;
$function$;

-- ============================================================================
-- 8. Privilégios de função: nada para anon; authenticated só nas funções de API
-- ============================================================================

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'agente\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

grant execute on function public.agente_iniciar_execucao(text, text, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.agente_carregar_memorias(uuid) to authenticated;
grant execute on function public.agente_registrar_chamada(uuid, text, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.agente_reservar_chamada(uuid, text, text, jsonb, text, text, text) to authenticated;
grant execute on function public.agente_concluir_chamada(uuid, text, jsonb, text) to authenticated;
grant execute on function public.agente_propor_acao(uuid, text, jsonb, text, integer) to authenticated;
grant execute on function public.agente_propor_memoria(uuid, text) to authenticated;
grant execute on function public.agente_propor_skill(uuid, text, text, text) to authenticated;
grant execute on function public.agente_finalizar_execucao(uuid, text, jsonb, text, integer, integer, integer) to authenticated;
grant execute on function public.agente_acao_iniciar_execucao(uuid, text, uuid) to authenticated;
grant execute on function public.agente_acao_finalizar(uuid, boolean, jsonb, text) to authenticated;
grant execute on function public.agente_acoes_rejeitar(uuid[], text) to authenticated;
grant execute on function public.agente_memoria_decidir(uuid[], text) to authenticated;
grant execute on function public.agente_memoria_criar(text, text) to authenticated;
grant execute on function public.agente_skill_decidir(uuid, text, text) to authenticated;
