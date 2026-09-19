-- FASE 2 (APLICADA em 2026-09-19) — apontadores: RLS + remoção do PIN em texto puro.
-- Foi rodada depois de publicar os novos app-operacional e portal-tableros
-- (a fase 1 já está aplicada: coluna pin_hash, validar_pin, criar_apontador, tentativas).
-- Clientes antigos (PWA em cache) deixam de validar PIN depois desta migração.

alter table public.app_apontadores enable row level security;

create policy "admins gerenciam apontadores" on public.app_apontadores
  for all to authenticated
  using (exists (select 1 from public.user_profiles up
                  where up.id = auth.uid() and up.role in ('super_admin', 'admin')))
  with check (exists (select 1 from public.user_profiles up
                       where up.id = auth.uid() and up.role in ('super_admin', 'admin')));

-- anon nunca acessa; authenticated só lê colunas não sensíveis e apaga (criação é via criar_apontador)
revoke all on table public.app_apontadores from anon, authenticated;
grant select (id, nome_completo, status, criado_em) on public.app_apontadores to authenticated;
grant delete on public.app_apontadores to authenticated;

alter table public.app_apontadores drop column pin;
