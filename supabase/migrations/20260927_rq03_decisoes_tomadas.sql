-- RQ03: DECISÕES TOMADAS sobre cada não conformidade (categoria reprovada) de um registro REPROVADO.
-- Pedido do usuário (2026-09-27): uma seção por NC (categoria) dentro do registro; quem tem "Ações" em Qualidade
-- registra; é um histórico de entradas que PODE ser editado (vai que erram algo); aparece no PDF gerado pelo portal
-- quando existir; a lista marca com selo os reprovados com NC ainda sem decisão.
--
-- Escrita só por funções security definer (a tabela não tem policy de escrita). Cada edição guarda o texto anterior em
-- `versoes` (trilha de auditoria de um registro de qualidade) e quem/quando editou. Não há exclusão.

create table if not exists public.qualidade_rq03_decisoes (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.qualidade_laminacao_rq03(id) on delete cascade,
  categoria text not null check (categoria in ('comprimento', 'largura', 'espessura', 'esquadro', 'temperatura')),
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  autor_id uuid not null,
  autor_nome text not null,
  criado_em timestamptz not null default now(),
  editado_em timestamptz,
  editado_por_id uuid,
  editado_por_nome text,
  versoes jsonb not null default '[]'::jsonb
);
create index if not exists qualidade_rq03_decisoes_registro_idx on public.qualidade_rq03_decisoes (registro_id, categoria, criado_em);
alter table public.qualidade_rq03_decisoes enable row level security;
revoke all on public.qualidade_rq03_decisoes from anon, authenticated;
grant select on public.qualidade_rq03_decisoes to authenticated;
create policy "Qualidade vê as decisões do RQ03" on public.qualidade_rq03_decisoes
  for select to authenticated using (public.pode_ver_qualidade());

-- "Ações" no módulo Qualidade do portal (admin passa direto; o módulo do app-operacional não conta)
create or replace function public.pode_agir_qualidade()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = auth.uid()
         and m.slug = 'qualidade'
         and ump.can_view
         and ump.can_actions
    );
$$;

create or replace function public.registrar_rq03_decisao(p_registro_id uuid, p_categoria text, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_status text;
  v_categorias jsonb;
  v_nome text;
  v_id uuid;
begin
  if auth.uid() is null or not public.pode_agir_qualidade() then
    raise exception 'SEM_PERMISSAO';
  end if;
  if v_texto = '' or char_length(v_texto) > 2000 then
    raise exception 'TEXTO_INVALIDO';
  end if;
  select r.status, r.resumo -> 'categorias_reprovadas' into v_status, v_categorias
    from public.qualidade_laminacao_rq03 r where r.id = p_registro_id;
  if not found then
    raise exception 'REGISTRO_INEXISTENTE';
  end if;
  -- Só as categorias que reprovaram o registro (a regra de reprovação mora em registrar_rq03_laminacao)
  if v_status <> 'REPROVADO' or not (coalesce(v_categorias, '[]'::jsonb) ? p_categoria) then
    raise exception 'CATEGORIA_NAO_REPROVADA';
  end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email, 'Usuário') into v_nome from public.user_profiles up where up.id = auth.uid();

  insert into public.qualidade_rq03_decisoes (registro_id, categoria, texto, autor_id, autor_nome)
  values (p_registro_id, p_categoria, v_texto, auth.uid(), coalesce(v_nome, 'Usuário'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.editar_rq03_decisao(p_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_atual public.qualidade_rq03_decisoes%rowtype;
  v_nome text;
begin
  if auth.uid() is null or not public.pode_agir_qualidade() then
    raise exception 'SEM_PERMISSAO';
  end if;
  if v_texto = '' or char_length(v_texto) > 2000 then
    raise exception 'TEXTO_INVALIDO';
  end if;
  select * into v_atual from public.qualidade_rq03_decisoes d where d.id = p_id for update;
  if not found then
    raise exception 'DECISAO_INEXISTENTE';
  end if;
  if v_atual.texto = v_texto then
    return; -- nada mudou: não gera versão à toa
  end if;
  select coalesce(nullif(btrim(up.full_name), ''), up.email, 'Usuário') into v_nome from public.user_profiles up where up.id = auth.uid();

  update public.qualidade_rq03_decisoes
     set versoes = versoes || jsonb_build_object('texto', v_atual.texto, 'em', coalesce(v_atual.editado_em, v_atual.criado_em), 'por', coalesce(v_atual.editado_por_nome, v_atual.autor_nome)),
         texto = v_texto,
         editado_em = now(),
         editado_por_id = auth.uid(),
         editado_por_nome = coalesce(v_nome, 'Usuário')
   where id = p_id;
end;
$$;

-- Coluna calculada (padrão PostgREST, como apontado_pecas): quantas NCs (categorias reprovadas) do registro ainda não
-- têm nenhuma decisão. security invoker: respeita a RLS de quem lista. 0 para registro aprovado.
create or replace function public.rq03_decisoes_pendentes(r public.qualidade_laminacao_rq03)
returns integer
language sql
stable
set search_path = public
as $$
  select case when r.status = 'REPROVADO' then (
    select count(*)::integer
      from jsonb_array_elements_text(coalesce(r.resumo -> 'categorias_reprovadas', '[]'::jsonb)) as c(categoria)
     where not exists (select 1 from public.qualidade_rq03_decisoes d where d.registro_id = r.id and d.categoria = c.categoria)
  ) else 0 end;
$$;

revoke all on function public.registrar_rq03_decisao(uuid, text, text) from public, anon;
revoke all on function public.editar_rq03_decisao(uuid, text) from public, anon;
grant execute on function public.registrar_rq03_decisao(uuid, text, text) to authenticated;
grant execute on function public.editar_rq03_decisao(uuid, text) to authenticated;
