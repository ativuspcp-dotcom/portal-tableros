-- RQ03: retenção de 60 dias das fotos (bucket qualidade-fotos). Ver PLANO_RQ03.md, seção "Volume de fotos".
--
-- Apagar linha de storage.objects via SQL NÃO remove o arquivo do disco; a remoção tem de passar pela Storage API.
-- Por isso: pg_cron (todo dia) -> rq03_disparar_limpeza() -> pg_net chama a edge function rq03-limpeza-fotos ->
-- a função lista (rq03_limpeza_listar), remove pela Storage API, e depois carimba (rq03_limpeza_marcar) a coluna
-- fotos_removidas_em nos registros cujas fotos já não existem. Portal e PDF passam a usar essa coluna.
--
-- A regra de 60 dias vale para TODO objeto do bucket (referenciado ou órfão — foto que subiu e o registro nunca
-- foi salvo porque a rede caiu). O prazo mora só aqui (default de p_dias); a edge function não o repete.
-- A edge function é chamada pelo cron (sem usuário logado) e prova quem é por uma chave no Vault
-- (rq03_limpeza_chave); ela é conferida por rq03_limpeza_chave_valida, então nenhuma secret precisa ser criada
-- no Dashboard. Só o service_role executa as funções de apoio.

alter table public.qualidade_laminacao_rq03
  add column if not exists fotos_removidas_em timestamptz;

comment on column public.qualidade_laminacao_rq03.fotos_removidas_em is
  'Preenchido pela rotina de limpeza (rq03-limpeza-fotos) quando as fotos do apontamento passam do prazo de retenção e saem do Storage. Nulo = fotos ainda guardadas.';

-- Chave do cron -> edge function (gerada aqui, nunca sai do banco/Vault)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rq03_limpeza_chave') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'rq03_limpeza_chave',
      'Chave que o pg_cron envia à edge function rq03-limpeza-fotos (header x-limpeza-chave)');
  end if;
end $$;

create or replace function public.rq03_limpeza_chave_valida(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(p_chave <> '' and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'rq03_limpeza_chave' and s.decrypted_secret = p_chave), false);
$$;

-- Nomes dos objetos do bucket que passaram do prazo (a edge function os remove pela Storage API)
create or replace function public.rq03_limpeza_listar(p_dias integer default 60, p_limite integer default 200)
returns setof text
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
    select o.name
    from storage.objects o
    where o.bucket_id = 'qualidade-fotos'
      and o.created_at < now() - make_interval(days => p_dias)
    order by o.created_at
    limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end;
$$;

-- Carimba os registros vencidos cujas fotos já não existem no Storage (se sobrou alguma, tenta de novo no dia seguinte)
create or replace function public.rq03_limpeza_marcar(p_dias integer default 60)
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_qtd integer;
begin
  if p_dias is null or p_dias < 1 then
    raise exception 'PRAZO_INVALIDO';
  end if;
  update public.qualidade_laminacao_rq03 r
     set fotos_removidas_em = now()
   where r.fotos_removidas_em is null
     and r.created_at < now() - make_interval(days => p_dias)
     and not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'qualidade-fotos'
         and o.name like format('rq03/%s/%%/%s/%%', r.bpl_id, r.id));
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

-- Chamada pelo pg_cron: dispara a edge function (pg_net é assíncrono; o resultado fica nos logs da função)
create or replace function public.rq03_disparar_limpeza()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_chave text;
begin
  select s.decrypted_secret into v_chave from vault.decrypted_secrets s where s.name = 'rq03_limpeza_chave';
  if v_chave is null then
    raise exception 'CHAVE_LIMPEZA_AUSENTE';
  end if;
  return net.http_post(
    url := 'https://mqtyjzdwwgeycvmbiqsg.supabase.co/functions/v1/rq03-limpeza-fotos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-limpeza-chave', v_chave),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end;
$$;

revoke all on function public.rq03_limpeza_chave_valida(text) from public, anon, authenticated;
revoke all on function public.rq03_limpeza_listar(integer, integer) from public, anon, authenticated;
revoke all on function public.rq03_limpeza_marcar(integer) from public, anon, authenticated;
revoke all on function public.rq03_disparar_limpeza() from public, anon, authenticated;
grant execute on function public.rq03_limpeza_chave_valida(text) to service_role;
grant execute on function public.rq03_limpeza_listar(integer, integer) to service_role;
grant execute on function public.rq03_limpeza_marcar(integer) to service_role;

-- Todo dia às 06:00 UTC (03:00 em Brasília, fábrica parada)
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('rq03-limpeza-fotos', '0 6 * * *', 'select public.rq03_disparar_limpeza()');
