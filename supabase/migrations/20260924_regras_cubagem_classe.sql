-- Classe da lâmina (CAPA / ENCHIMENTO / MIOLO) por regra de apontamento. Vai ajudar a encontrar o
-- item correto (Cód. Item/Item) no apontamento. Nullable: as regras já cadastradas não têm classe
-- definida até o usuário preencher em Configurações > PCP > Secagem.
alter table public.pcp_secagem_regras_cubagem
  add column classe text check (classe in ('CAPA', 'ENCHIMENTO', 'MIOLO'));
