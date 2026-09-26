-- RQ03: prazo de retenção por bucket. Fotos (qualidade-fotos): 60 dias (p_dias). PDFs enviados por WhatsApp
-- (qualidade-alertas): 1 dia — o arquivo só serve para o BubbleWhats baixar (a URL assinada dura 1 h); a cópia que
-- importa fica no histórico do WhatsApp e o portal gera o PDF na hora, sem guardar. Como a rotina roda 1x por dia
-- (06:00 UTC), um PDF vive entre 24 e 48 h. Para outro bucket/prazo: acrescentar uma linha no VALUES.
create or replace function public.rq03_limpeza_listar(p_dias integer default 60, p_limite integer default 200)
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
    join (values ('qualidade-fotos', p_dias), ('qualidade-alertas', 1)) as prazo(bucket_id, dias) on prazo.bucket_id = o.bucket_id
    where o.created_at < now() - make_interval(days => prazo.dias)
    order by o.created_at
    limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end;
$$;
