-- Bateria de testes do schema dos agentes. Uso: concatenar 'begin;' + schema-rascunho.sql + este arquivo
-- e rodar via execute_sql. O último bloco SEMPRE lança erro (RELATORIO_TESTES [...]), o que desfaz tudo:
-- nada fica no banco. Depois, conferir que não sobrou tabela/função agente_* (antes de aplicar) e que a chave
-- real do Vault continua intacta (ver agentes/APLICAR.md). Também roda SOZINHO depois de aplicada a migration
-- (sem o schema-rascunho.sql) como verificação pós-aplicação.
-- Precisa de 2 usuários ativos com role 'user' e 1 admin em user_profiles.

-- ===================== BATERIA DE TESTES (dentro da mesma transação) =====================
-- A chave real do motor já existe no Vault (criada pelo dono do projeto). Troca o valor SÓ dentro desta
-- transação (o rollback final restaura a chave real). Se ainda não existir, cria uma de teste.
do $v$
begin
  if exists (select 1 from vault.secrets where name = 'agente_motor_chave') then
    perform vault.update_secret((select id from vault.secrets where name = 'agente_motor_chave'), 'chave-teste-123');
  else
    perform vault.create_secret('chave-teste-123', 'agente_motor_chave');
  end if;
end
$v$;

create temp table _res (n serial, teste text, esperado text, obtido text);

insert into public.agentes (slug, nome) values ('teste-agente', 'Teste');

do $t$
declare
  v_user uuid := (select id from public.user_profiles where role = 'user' and status = 'active' order by created_at limit 1);
  v_admin uuid := (select id from public.user_profiles where role in ('admin','super_admin') and status = 'active' order by created_at limit 1);
  v_robo uuid := (select id from public.user_profiles where role = 'user' and status = 'active' order by created_at offset 1 limit 1);
  h_ok text := json_build_object('x-agente-chave', 'chave-teste-123')::text;
  r text; e1 uuid; e2 uuid; c1 uuid; a1 uuid; a2 uuid; m1 uuid; hash text; n int;

begin
  update public.agentes set robo_user_id = v_robo where slug = 'teste-agente';

  -- T1: usuário comum sem a chave do motor
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  begin
    execute 'set local role authenticated';
    perform public.agente_iniciar_execucao('teste-agente', 'faturar', 'execucao_direta', 'usuario', null, '{"pedido":1}', gen_random_uuid());
    r := 'OK';
    execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('usuario sem chave do motor', 'SOMENTE_MOTOR', r);

  -- T2: com chave, execução direta modo usuário
  perform set_config('request.headers', h_ok, true);
  begin
    execute 'set local role authenticated';
    select execucao_id into e1 from public.agente_iniciar_execucao('teste-agente', 'faturar', 'execucao_direta', 'usuario', null, '{"pedido":1}', '00000000-0000-0000-0000-000000000001');
    r := 'OK';
    execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('inicia execucao direta', 'OK', r);

  -- T3: mesma chave de idempotência
  begin
    execute 'set local role authenticated';
    perform public.agente_iniciar_execucao('teste-agente', 'faturar', 'execucao_direta', 'usuario', null, '{"pedido":1}', '00000000-0000-0000-0000-000000000001');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('mesma chave idempotencia', 'EXECUCAO_DUPLICADA', r);

  -- T4: outra chave, mesma entrada, enquanto a primeira está em andamento (clique duplo)
  begin
    execute 'set local role authenticated';
    perform public.agente_iniciar_execucao('teste-agente', 'faturar', 'execucao_direta', 'usuario', null, '{"pedido":1}', gen_random_uuid());
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('clique duplo mesma entrada', 'EXECUCAO_DUPLICADA', r);

  -- T5: execucao_direta em modo robo
  begin
    execute 'set local role authenticated';
    perform public.agente_iniciar_execucao('teste-agente', 'faturar', 'execucao_direta', 'robo', 'pcp', '{}', gen_random_uuid());
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('direta + robo', 'DIRETA_SO_MODO_USUARIO', r);

  -- T6: robo sem modulo_exigido
  begin
    execute 'set local role authenticated';
    perform public.agente_iniciar_execucao('teste-agente', 'resumo', 'pode_propor_acao', 'robo', null, '{}', gen_random_uuid());
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('robo sem modulo_exigido', 'MODULO_EXIGIDO_AUSENTE', r);

  -- T7: robo com módulo que o usuário não tem
  begin
    execute 'set local role authenticated';
    perform public.agente_iniciar_execucao('teste-agente', 'resumo', 'pode_propor_acao', 'robo', 'modulo-que-nao-existe', '{}', gen_random_uuid());
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('robo sem permissao no modulo', 'SEM_PERMISSAO', r);

  -- T8: propor ação numa execução direta
  begin
    execute 'set local role authenticated';
    perform public.agente_propor_acao(e1, 'faturar_pedido', '{"pedido":2}', 'teste');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('propor em execucao_direta', 'TIPO_NAO_PROPOE', r);

  -- T9/T10: escrita sensível uma vez só por execução
  begin
    execute 'set local role authenticated';
    c1 := public.agente_reservar_chamada(e1, 'faturar_pedido', 'escrita_sensivel', '{"pedido":1}');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('reserva escrita em direta', 'OK', r);
  begin
    execute 'set local role authenticated';
    perform public.agente_reservar_chamada(e1, 'faturar_pedido', 'escrita_sensivel', '{"pedido":1}');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('segunda escrita mesma ferramenta', 'ESCRITA_JA_EXECUTADA', r);
  begin
    execute 'set local role authenticated';
    perform public.agente_concluir_chamada(c1, 'ok', '{"doc":123}');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('conclui escrita', 'OK', r);

  -- T11: notificação sem destinatário
  begin
    execute 'set local role authenticated';
    perform public.agente_reservar_chamada(e1, 'enviar_email', 'notificacao', '{}', null, null);
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('notificacao sem destinatario', 'agente_chamadas_notificacao_com_destino', r);

  -- T12: execução de investigação + proposta + deduplicação
  begin
    execute 'set local role authenticated';
    select execucao_id into e2 from public.agente_iniciar_execucao('teste-agente', 'investigar-op', 'pode_propor_acao', 'usuario', null, '{"op":7}', gen_random_uuid());
    a1 := public.agente_propor_acao(e2, 'atualizar_status_op', '{"op":7,"status":"x"}', 'OP atrasada');
    a2 := public.agente_propor_acao(e2, 'atualizar_status_op', '{"status":"x","op":7}', 'repetida');
    r := case when a1 = a2 then 'OK' else 'DUPLICOU' end; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('proposta identica nao duplica', 'OK', r);

  -- T13: escrita direta numa execução de investigação
  begin
    execute 'set local role authenticated';
    perform public.agente_reservar_chamada(e2, 'atualizar_status_op', 'escrita_sensivel', '{}');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('escrita em pode_propor_acao', 'TIPO_NAO_ESCREVE', r);

  -- T14: usuário comum lendo tabelas
  begin
    execute 'set local role authenticated';
    r := (select count(*) from public.agente_execucoes)::text || '/' || (select count(*) from public.agente_acoes)::text
      || '/' || (select count(*) from public.agentes)::text || '/' || (select count(*) from public.agente_execucao_chamadas)::text;
    execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('user le execucoes/acoes/agentes/chamadas', '2/0/0/0', r);

  -- T15: usuário comum escrevendo direto na tabela
  begin
    execute 'set local role authenticated';
    insert into public.agente_acoes (agente_id, execucao_id, tarefa, ferramenta, argumentos, payload_hash, justificativa)
    select agente_id, id, tarefa, 'x', '{}', 'h', 'forjada' from public.agente_execucoes limit 1;
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('user insert direto em agente_acoes', 'permission denied for table agente_acoes', r);
  begin
    execute 'set local role authenticated';
    update public.agente_execucoes set status = 'concluida';
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('user update direto em agente_execucoes', 'permission denied for table agente_execucoes', r);

  -- T16: outro usuário (admin) usando a execução de e2
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agente_registrar_chamada(e2, 'ler_op', 'leitura', 'ok');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('execucao de outro usuario', 'EXECUCAO_INVALIDA', r);

  -- T17: usuário comum tentando executar ação aprovada
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select payload_hash into hash from public.agente_acoes where id = a1;
  begin
    execute 'set local role authenticated';
    perform public.agente_acao_iniciar_execucao(a1, hash);
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('user executa proposta', 'SEM_PERMISSAO', r);

  -- T18..T21: admin aprovando
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agente_acao_iniciar_execucao(a1, 'hash-errado');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('admin com hash diferente do visto', 'HASH_DIVERGENTE', r);
  begin
    execute 'set local role authenticated';
    perform public.agente_acao_iniciar_execucao(a1, hash);
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('admin inicia execucao da proposta', 'OK', r);
  begin
    execute 'set local role authenticated';
    perform public.agente_acao_iniciar_execucao(a1, hash);
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('aprovacao em dobro', 'ACAO_NAO_PENDENTE', r);
  begin
    execute 'set local role authenticated';
    perform public.agente_acao_finalizar(a1, true, '{"ok":1}');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('admin finaliza proposta', 'OK', r);
  begin
    execute 'set local role authenticated';
    r := (select count(*) from public.agente_acoes)::text;
    execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('admin le agente_acoes', '1', r);

  -- T22: payload adulterado mesmo por quem tem acesso total (trigger)
  begin
    update public.agente_acoes set argumentos = '{"op":999}' where id = a1;
    r := 'OK';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('superusuario altera payload', 'CAMPO_IMUTAVEL', r);

  -- T23: memória pendente não carrega; aprovada carrega
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    m1 := public.agente_propor_memoria(e2, 'Fornecedor X atrasa às sextas');
    select count(*) into n from public.agente_carregar_memorias(e2);
    r := n::text; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('memoria pendente nao carrega', '0', r);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agente_memoria_decidir(array[m1], 'aprovada');
    execute 'reset role';
  exception when others then r := sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    select count(*) into n from public.agente_carregar_memorias(e2);
    r := n::text; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('memoria aprovada carrega', '1', r);

  -- T24: usuário comum tentando aprovar memória
  begin
    execute 'set local role authenticated';
    perform public.agente_memoria_decidir(array[m1], 'arquivada');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('user decide memoria', 'SEM_PERMISSAO', r);

  -- T25: finalizar e tentar usar depois
  begin
    execute 'set local role authenticated';
    perform public.agente_finalizar_execucao(e1, 'concluida', '{"faturado":true}');
    perform public.agente_registrar_chamada(e1, 'ler', 'leitura', 'ok');
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('usar execucao finalizada', 'EXECUCAO_INVALIDA', r);

  -- T26: anon chamando função e lendo tabela
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.agente_acoes_rejeitar(array[a1]);
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('anon chama RPC', 'permission denied for function agente_acoes_rejeitar', r);
  begin
    execute 'set local role anon';
    perform count(*) from public.agente_execucoes;
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('anon le execucoes', 'permission denied for table agente_execucoes', r);

  -- T27: helper interno exposto?
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agente_execucao_ativa(e2);
    r := 'OK'; execute 'reset role';
  exception when others then r := sqlerrm; end;
  insert into _res (teste, esperado, obtido) values ('user chama helper interno', 'permission denied for function agente_execucao_ativa', r);

  insert into _res (teste, esperado, obtido) values ('usuarios de teste encontrados', 'true', (v_user is not null and v_admin is not null and v_robo is not null)::text);
end;
$t$;

-- Aborta SEMPRE: devolve o relatório na mensagem de erro e desfaz tudo (nada fica no banco).
do $f$
begin
  raise exception 'RELATORIO_TESTES %', (
    select json_agg(json_build_object('n', n, 't', teste, 'ok', obtido like '%' || esperado || '%', 'obtido', obtido) order by n)
      from _res);
end;
$f$;
