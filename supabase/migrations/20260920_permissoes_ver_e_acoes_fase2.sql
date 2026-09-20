-- FASE 2 das permissões Ver/Ações: portal e app novos estão no ar e a edge function create-user (v5)
-- já grava can_actions. Remove o trigger de transição e as colunas antigas.

drop trigger if exists derivar_can_actions_trg on public.user_module_permissions;
drop function if exists public.derivar_can_actions();

alter table public.user_module_permissions
  drop column can_create,
  drop column can_edit,
  drop column can_delete;
