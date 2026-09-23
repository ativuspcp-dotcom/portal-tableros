-- Comprimento/Largura resolvidos no momento do apontamento (podem diferir do setup quando a
-- Opção escolhida tem override fixo — ver pcp_secagem_regras_cubagem). Nullable porque ainda há
-- uma combinação (OMECO comprimento 2,600 + largura 0,870) sem regra confirmada até 2026-09-23
-- (foi passada pelo usuário na mesma mensagem, já incluída no insert abaixo).
alter table public.secagem_apontamentos
  add column comprimento numeric,
  add column largura numeric;

-- Local Estoque: MERCADO INTERNO trocado por SERRAR a pedido do usuário (2026-09-23).
alter table public.secagem_apontamentos drop constraint secagem_apontamentos_local_estoque_check;
alter table public.secagem_apontamentos add constraint secagem_apontamentos_local_estoque_check
  check (local_estoque in ('CONSUMIR', 'RESSECAR', 'SERRAR'));

-- Regras de cubagem por combinação de setup (secador + comprimento + largura): quais Opções
-- existem, se cada uma cuba por PEÇAS ou por ALTURA, se o comprimento/largura usado no cálculo é
-- o do setup ("Puxa do Setup" = override null) ou um valor fixo, e o desconto padrão da opção.
create table public.pcp_secagem_regras_cubagem (
  id uuid primary key default gen_random_uuid(),
  secador text not null,
  comprimento_setup numeric not null,
  largura_setup numeric not null,
  opcao text not null,
  modo_cubagem text not null check (modo_cubagem in ('PEÇAS', 'ALTURA')),
  comprimento_override numeric,
  largura_override numeric,
  desconto integer not null default 0,
  created_at timestamp with time zone not null default now(),
  unique (secador, comprimento_setup, largura_setup, opcao)
);

create index pcp_secagem_regras_cubagem_lookup_idx
  on public.pcp_secagem_regras_cubagem (secador, comprimento_setup, largura_setup);

alter table public.pcp_secagem_regras_cubagem enable row level security;

create policy "Usuários autenticados podem ver regras de cubagem de secagem"
  on public.pcp_secagem_regras_cubagem for select
  to authenticated
  using (true);

create policy "Admins podem gerenciar regras de cubagem de secagem"
  on public.pcp_secagem_regras_cubagem for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.pcp_secagem_regras_cubagem
  (secador, comprimento_setup, largura_setup, opcao, modo_cubagem, comprimento_override, largura_override, desconto)
values
  ('FEZER', 2.6, 1.3, 'A', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 1.3, 'B', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 1.3, 'C', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 1.3, 'CP', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 1.3, 'D', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 1.3, 'L', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 1.3, 'G', 'ALTURA', null, null, 50),
  ('FEZER', 2.6, 1.3, 'CASCA', 'ALTURA', null, null, 50),

  ('FEZER', 2.6, 0.87, 'L', 'PEÇAS', null, null, 0),
  ('FEZER', 2.6, 0.87, 'G', 'ALTURA', null, 1.3, 50),
  ('FEZER', 2.6, 0.87, 'CASCA', 'ALTURA', null, 1.3, 50),

  ('OMECO', 2.6, 1.3, 'A', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 1.3, 'B', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 1.3, 'C', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 1.3, 'CP', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 1.3, 'D', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 1.3, 'L', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 1.3, 'G', 'ALTURA', null, null, 50),
  ('OMECO', 2.6, 1.3, 'CASCA', 'ALTURA', null, null, 50),

  ('OMECO', 1.3, 0.87, 'L', 'PEÇAS', null, null, 0),
  ('OMECO', 1.3, 0.87, 'G', 'ALTURA', 2.6, 1.3, 50),
  ('OMECO', 1.3, 0.87, 'CASCA', 'ALTURA', 2.6, 1.3, 50),

  ('OMECO', 2.6, 0.87, 'L', 'PEÇAS', null, null, 0),
  ('OMECO', 2.6, 0.87, 'G', 'ALTURA', 2.6, 1.3, 50),
  ('OMECO', 2.6, 0.87, 'CASCA', 'ALTURA', 2.6, 1.3, 50);
