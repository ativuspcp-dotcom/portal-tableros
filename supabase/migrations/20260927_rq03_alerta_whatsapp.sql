-- RQ03: envio do PDF por WhatsApp (BubbleWhats) quando o apontamento sai REPROVADO. Ver PLANO_RQ03.md, seção
-- "Envio do PDF por WhatsApp".
--
-- Fluxo: INSERT REPROVADO -> gatilho grava uma linha em qualidade_rq03_alertas e dispara (pg_net) a edge function
-- rq03-alerta-whatsapp; um job do pg_cron a cada minuto reprocessa o que ficou pendente (retentativa). A função gera
-- o PDF (rq03-relatorio-pdf em modo chave), grava no bucket privado qualidade-alertas, gera uma URL assinada de 1 h e
-- chama o send-doc do BubbleWhats (que só aceita URL pública). O PDF sai do bucket pela rotina de limpeza de 60 dias.
--
-- O ID e o token do aparelho BubbleWhats NÃO estão neste arquivo: ficam no Vault (bubblewhats_device_id /
-- bubblewhats_device_token), criados à parte. O destino (grupo ou número) de cada filial fica em
-- qualidade_rq03_whatsapp_destinos; sem destino ativo o alerta nasce 'sem_destino' e nunca é enviado.
-- O envio NUNCA pode impedir o apontamento: o gatilho engole qualquer erro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qualidade-alertas', 'qualidade-alertas', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Destino do alerta por filial (jid = número com DDI, ex. 5511999999999, ou grupo, ex. 120363...@g.us)
create table if not exists public.qualidade_rq03_whatsapp_destinos (
  bpl_id integer primary key,
  jid text not null check (jid ~ '^[0-9]{10,20}(-[0-9]+)?(@g\.us)?$'),
  descricao text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
alter table public.qualidade_rq03_whatsapp_destinos enable row level security;
revoke all on public.qualidade_rq03_whatsapp_destinos from anon;
create policy "Admin gerencia destinos de WhatsApp do RQ03" on public.qualidade_rq03_whatsapp_destinos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Fila/trilha dos alertas: um por apontamento reprovado
create table if not exists public.qualidade_rq03_alertas (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null unique references public.qualidade_laminacao_rq03(id) on delete cascade,
  bpl_id integer not null,
  status text not null check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'sem_destino')),
  tentativas integer not null default 0,
  proxima_tentativa timestamptz not null default now(),
  ultimo_erro text,
  enviado_em timestamptz,
  mensagem_id text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists qualidade_rq03_alertas_devidos_idx
  on public.qualidade_rq03_alertas (proxima_tentativa) where status in ('pendente', 'enviando');
alter table public.qualidade_rq03_alertas enable row level security;
revoke all on public.qualidade_rq03_alertas from anon, authenticated;
grant select on public.qualidade_rq03_alertas to authenticated;
create policy "Qualidade vê os alertas de WhatsApp do RQ03" on public.qualidade_rq03_alertas
  for select to authenticated using (public.pode_ver_qualidade());

-- Chave do pg_cron/gatilho -> edge functions do alerta (gerada aqui, nunca sai do banco/Vault)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rq03_alerta_chave') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'rq03_alerta_chave',
      'Chave enviada às edge functions rq03-alerta-whatsapp / rq03-relatorio-pdf (header x-alerta-chave)');
  end if;
end $$;

create or replace function public.rq03_alerta_chave_valida(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(p_chave <> '' and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'rq03_alerta_chave' and s.decrypted_secret = p_chave), false);
$$;

-- Credenciais do aparelho BubbleWhats (só o service_role da edge function lê)
create or replace function public.rq03_alerta_credenciais()
returns table (device_id text, token text)
language sql
stable
security definer
set search_path = public, vault
as $$
  select (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'bubblewhats_device_id'),
         (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'bubblewhats_device_token');
$$;

-- Dispara a edge function se houver alerta devido (pg_net é assíncrono: envia depois do commit).
-- "Devido" = pendente com a hora chegada (ou 'enviando' esquecido há 10 min por queda da função) e destino ativo.
create or replace function public.rq03_disparar_alertas()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_chave text;
begin
  if not exists (
    select 1 from public.qualidade_rq03_alertas a
    join public.qualidade_rq03_whatsapp_destinos d on d.bpl_id = a.bpl_id and d.ativo
    where a.proxima_tentativa <= now() and a.tentativas < 5
      and (a.status = 'pendente' or (a.status = 'enviando' and a.atualizado_em < now() - interval '10 minutes'))
  ) then
    return null;
  end if;
  select s.decrypted_secret into v_chave from vault.decrypted_secrets s where s.name = 'rq03_alerta_chave';
  if v_chave is null then
    raise exception 'CHAVE_ALERTA_AUSENTE';
  end if;
  return net.http_post(
    url := 'https://mqtyjzdwwgeycvmbiqsg.supabase.co/functions/v1/rq03-alerta-whatsapp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alerta-chave', v_chave),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end;
$$;

-- Gatilho: REPROVADO entra na fila. Falha aqui NUNCA pode derrubar o apontamento.
create or replace function public.rq03_enfileirar_alerta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tem_destino boolean;
begin
  begin
    select exists (select 1 from public.qualidade_rq03_whatsapp_destinos d where d.bpl_id = new.bpl_id and d.ativo)
      into v_tem_destino;
    insert into public.qualidade_rq03_alertas (registro_id, bpl_id, status)
    values (new.id, new.bpl_id, case when v_tem_destino then 'pendente' else 'sem_destino' end)
    on conflict (registro_id) do nothing;
    if v_tem_destino then
      perform public.rq03_disparar_alertas();
    end if;
  exception when others then
    raise warning 'RQ03: não foi possível enfileirar o alerta de WhatsApp (%): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists rq03_alerta_whatsapp_trg on public.qualidade_laminacao_rq03;
create trigger rq03_alerta_whatsapp_trg
  after insert on public.qualidade_laminacao_rq03
  for each row when (new.status = 'REPROVADO')
  execute function public.rq03_enfileirar_alerta();

-- Pega os alertas devidos (atômico: 'skip locked' + pendente -> enviando) e devolve o que a edge function precisa.
-- Antes, desiste dos que ficaram sem ser enviados por mais de 24 h (não mandar reprovação velha de surpresa).
create or replace function public.rq03_alerta_reservar(p_limite integer default 5)
returns table (alerta_id uuid, registro_id uuid, bpl_id integer, jid text, tentativa integer, linha text, criado_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qualidade_rq03_alertas a
     set status = 'falhou', ultimo_erro = coalesce(a.ultimo_erro, 'Não enviado em 24 h'), atualizado_em = now()
   where a.status in ('pendente', 'enviando') and a.created_at < now() - interval '24 hours';

  return query
  with c as (
    select a.id from public.qualidade_rq03_alertas a
    join public.qualidade_rq03_whatsapp_destinos d on d.bpl_id = a.bpl_id and d.ativo
    where a.proxima_tentativa <= now() and a.tentativas < 5
      and (a.status = 'pendente' or (a.status = 'enviando' and a.atualizado_em < now() - interval '10 minutes'))
    order by a.created_at
    limit greatest(least(coalesce(p_limite, 5), 20), 1)
    for update of a skip locked
  ),
  u as (
    update public.qualidade_rq03_alertas a
       set status = 'enviando', tentativas = a.tentativas + 1, atualizado_em = now()
      from c where a.id = c.id
    returning a.id, a.registro_id, a.bpl_id, a.tentativas
  )
  select u.id, u.registro_id, u.bpl_id, d.jid, u.tentativas, r.linha, r.created_at
  from u
  join public.qualidade_rq03_whatsapp_destinos d on d.bpl_id = u.bpl_id
  join public.qualidade_laminacao_rq03 r on r.id = u.registro_id;
end;
$$;

-- Resultado do envio: ok -> enviado; falha -> pendente com espera crescente (2, 4, 6, 8 min) ou 'falhou' na 5ª.
create or replace function public.rq03_alerta_finalizar(p_id uuid, p_ok boolean, p_mensagem_id text, p_erro text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tentativas integer;
begin
  select a.tentativas into v_tentativas
  from public.qualidade_rq03_alertas a
  where a.id = p_id and a.status = 'enviando'
  for update;
  if not found then
    return 'IGNORADO';
  end if;

  if p_ok then
    update public.qualidade_rq03_alertas
       set status = 'enviado', enviado_em = now(), mensagem_id = p_mensagem_id, ultimo_erro = null, atualizado_em = now()
     where id = p_id;
    return 'enviado';
  elsif v_tentativas >= 5 then
    update public.qualidade_rq03_alertas
       set status = 'falhou', ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 500), atualizado_em = now()
     where id = p_id;
    return 'falhou';
  else
    update public.qualidade_rq03_alertas
       set status = 'pendente', ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 500),
           proxima_tentativa = now() + make_interval(mins => v_tentativas * 2), atualizado_em = now()
     where id = p_id;
    return 'pendente';
  end if;
end;
$$;

-- A rotina de limpeza de 60 dias passa a varrer também o bucket dos PDFs (e devolve o bucket de cada objeto)
drop function if exists public.rq03_limpeza_listar(integer, integer);
create function public.rq03_limpeza_listar(p_dias integer default 60, p_limite integer default 200)
returns table (bucket text, nome text)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if p_dias is null or p_dias < 1 then
    raise exception 'PRAZO_INVALIDO';
  end if;
  return query
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id in ('qualidade-fotos', 'qualidade-alertas')
      and o.created_at < now() - make_interval(days => p_dias)
    order by o.created_at
    limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end;
$$;

revoke all on function public.rq03_alerta_chave_valida(text) from public, anon, authenticated;
revoke all on function public.rq03_alerta_credenciais() from public, anon, authenticated;
revoke all on function public.rq03_disparar_alertas() from public, anon, authenticated;
revoke all on function public.rq03_enfileirar_alerta() from public, anon, authenticated;
revoke all on function public.rq03_alerta_reservar(integer) from public, anon, authenticated;
revoke all on function public.rq03_alerta_finalizar(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.rq03_limpeza_listar(integer, integer) from public, anon, authenticated;
grant execute on function public.rq03_alerta_chave_valida(text) to service_role;
grant execute on function public.rq03_alerta_credenciais() to service_role;
grant execute on function public.rq03_alerta_reservar(integer) to service_role;
grant execute on function public.rq03_alerta_finalizar(uuid, boolean, text, text) to service_role;
grant execute on function public.rq03_limpeza_listar(integer, integer) to service_role;

-- Reprocessa a fila a cada minuto (só chama a edge function se houver alerta devido)
select cron.schedule('rq03-alertas-whatsapp', '* * * * *', 'select public.rq03_disparar_alertas()');
