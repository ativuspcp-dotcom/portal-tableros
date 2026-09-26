-- RQ03: troca o job "a cada minuto" (polling) do alerta de WhatsApp por um temporizador de disparo único.
-- Motivo: o job de 1 em 1 minuto rodava o dia inteiro sem trabalho e enchia cron.job_run_details (1.440 linhas/dia).
--
-- Agora só existe temporizador quando há alerta em andamento: rq03_agendar_proxima() agenda UM job pontual
-- (rq03-alerta-timer, expressão de minuto/hora/dia/mês em UTC) para o próximo instante em que algo precisa acontecer
-- (retentativa marcada, ou checagem 10 min depois de um 'enviando' que pode ter ficado órfão por queda da função) e o
-- próprio job se refaz/remove ao rodar (rq03_alerta_timer). Sem alerta em andamento não há job. O envio imediato
-- continua sendo do gatilho (pg_net); o temporizador só cobre retentativa e falha ao chamar a função.
-- Limite: alerta com mais de 24 h ou com 5 tentativas não gera mais temporizador.

select cron.unschedule('rq03-alertas-whatsapp') where exists (select 1 from cron.job where jobname = 'rq03-alertas-whatsapp');
delete from cron.job_run_details where command = 'select public.rq03_disparar_alertas()';

create or replace function public.rq03_agendar_proxima()
returns timestamptz
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_quando timestamptz;
  v_utc timestamp;
begin
  select min(case when a.status = 'pendente' then a.proxima_tentativa else a.atualizado_em + interval '10 minutes' end)
    into v_quando
  from public.qualidade_rq03_alertas a
  join public.qualidade_rq03_whatsapp_destinos d on d.bpl_id = a.bpl_id and d.ativo
  where a.status in ('pendente', 'enviando') and a.tentativas < 5 and a.created_at > now() - interval '24 hours';

  if v_quando is null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'rq03-alerta-timer';
    return null;
  end if;

  -- pg_cron tem granularidade de minuto: agenda para o próximo minuto cheio depois do instante desejado
  v_quando := date_trunc('minute', greatest(v_quando, now()) + interval '1 minute');
  v_utc := v_quando at time zone 'UTC';
  perform cron.schedule(
    'rq03-alerta-timer',
    format('%s %s %s %s *', extract(minute from v_utc)::int, extract(hour from v_utc)::int, extract(day from v_utc)::int, extract(month from v_utc)::int),
    'select public.rq03_alerta_timer()');
  return v_quando;
end;
$$;

-- O que o job pontual executa: tenta o envio e reagenda (ou se remove, se não sobrou nada em andamento)
create or replace function public.rq03_alerta_timer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rq03_disparar_alertas();
  perform public.rq03_agendar_proxima();
end;
$$;

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
      perform public.rq03_agendar_proxima();
    end if;
  exception when others then
    raise warning 'RQ03: não foi possível enfileirar o alerta de WhatsApp (%): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

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

  -- Rede de segurança: se a função cair com estes alertas em 'enviando', o temporizador os reexamina em 10 min
  perform public.rq03_agendar_proxima();
end;
$$;

create or replace function public.rq03_alerta_finalizar(p_id uuid, p_ok boolean, p_mensagem_id text, p_erro text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tentativas integer;
  v_situacao text;
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
    v_situacao := 'enviado';
  elsif v_tentativas >= 5 then
    update public.qualidade_rq03_alertas
       set status = 'falhou', ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 500), atualizado_em = now()
     where id = p_id;
    v_situacao := 'falhou';
  else
    update public.qualidade_rq03_alertas
       set status = 'pendente', ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 500),
           proxima_tentativa = now() + make_interval(mins => v_tentativas * 2), atualizado_em = now()
     where id = p_id;
    v_situacao := 'pendente';
  end if;

  -- Agenda a retentativa (ou remove o temporizador se não sobrou nada em andamento)
  perform public.rq03_agendar_proxima();
  return v_situacao;
end;
$$;

revoke all on function public.rq03_agendar_proxima() from public, anon, authenticated;
revoke all on function public.rq03_alerta_timer() from public, anon, authenticated;
