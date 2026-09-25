-- SERRA 2 começa com as mesmas medidas e regras de apontamento da SERRA 1 (o usuário confirmou que são iguais).
-- Cada serra segue editável de forma independente em Configurações > PCP > Serra.
insert into public.pcp_secagem_setup_medidas (secador, comprimento, largura, ativo)
select 'SERRA 2', comprimento, largura, ativo
  from public.pcp_secagem_setup_medidas
 where secador = 'SERRA 1'
on conflict (secador, comprimento, largura) do nothing;

insert into public.pcp_secagem_regras_cubagem
  (secador, comprimento_setup, largura_setup, opcao, classe, modo_cubagem, comprimento_override, largura_override, desconto)
select 'SERRA 2', comprimento_setup, largura_setup, opcao, classe, modo_cubagem, comprimento_override, largura_override, desconto
  from public.pcp_secagem_regras_cubagem
 where secador = 'SERRA 1'
on conflict (secador, comprimento_setup, largura_setup, opcao) do nothing;
