-- Correção (2026-09-26): as linhas de laminação foram cadastradas por engano como FEZER/OMECO (nome dos
-- secadores da Secagem, sem relação). O correto: CHINÊS 8' e CHINÊS 4' (tornos laminadores chineses, 8 e 4
-- pés). Tabela pcp_laminadoras ainda sem nenhum apontamento do RQ03 gravado, então é troca pura de nome.
update public.pcp_laminadoras set nome = 'CHINÊS 8''' where bpl_id = 1 and nome = 'FEZER';
update public.pcp_laminadoras set nome = 'CHINÊS 4''' where bpl_id = 1 and nome = 'OMECO';
