# Roteiro para aplicar o schema dos agentes

> **EXECUTADO em 2026-09-24** (migration `agentes_base`, versão remota `20260924163536`). Não rodar de novo: as tabelas já existem. Fica como registro; para mudanças futuras, criar uma migration nova.

Para a sessão de aplicação (modelo **Sonnet** basta: o desenho está pronto e testado). Ler antes: [SCHEMA.md](SCHEMA.md) e o CLAUDE.md da raiz (seção "Arquitetura de Agentes"). **Não alterar o desenho**: se algo parecer errado, parar e avisar o dono do projeto.

Estado de partida (2026-09-24): D10–D14 aprovadas; chave do motor cadastrada no Vault (`agente_motor_chave`) pelo dono do projeto; nenhuma tabela `agente_*` no banco; projeto Supabase `mqtyjzdwwgeycvmbiqsg`.

## Regras da sessão

- **Nunca ler nem exibir o valor da chave do motor.** Conferir só existência e tamanho (`length(decrypted_secret) >= 32`).
- Nenhum dado de agente é semeado (nem "Finix"): cadastro de agente só quando o dono pedir.
- O `execute_sql` só devolve o resultado do último statement, e o SQL precisa ser colado inline (não há como passar arquivo): ler os arquivos com Read e montar a string.

## Passos

1. **Pré-checagem (leitura)**: `pg_tables` sem `agente%`; existe 1 segredo `agente_motor_chave` com 32 ou mais caracteres; há pelo menos 2 usuários `role = 'user'` ativos e 1 admin (os testes usam esses papéis).
2. **Rodar a bateria de novo, sem aplicar**: um único `execute_sql` com `begin;` + conteúdo de [schema-rascunho.sql](schema-rascunho.sql) + conteúdo de [schema-testes.sql](schema-testes.sql). O último bloco lança `RELATORIO_TESTES [...]` (é o esperado: desfaz tudo). **Exigir 33 de 33 com `ok: true`.** Qualquer falha → parar e reportar, não aplicar.
3. **Conferir que nada ficou**: 0 tabelas `agente%`, 0 funções `agente\_%` e a chave real intacta:
   `select length(decrypted_secret) >= 32 as intacta, decrypted_secret = 'chave-teste-123' as ficou_de_teste from vault.decrypted_secrets where name = 'agente_motor_chave'` → esperado `true` / `false`.
4. **Gravar a migration**: copiar `schema-rascunho.sql` para `supabase/migrations/20260924_agentes_base.sql` (convenção do repo: só a data no nome do arquivo; o banco grava o timestamp completo). Ajustar o comentário de cabeçalho: tirar "RASCUNHO — ainda NÃO aplicado", registrar a data de aplicação e manter as referências a SCHEMA.md/PLANO.md. Não mexer no SQL.
5. **Aplicar**: `apply_migration` com `name = 'agentes_base'` e o mesmo SQL do arquivo. Se der erro, o Postgres desfaz (transacional): reportar sem tentar remendar.
6. **Verificação pós-aplicação**:
   - `list_tables` (schema public): 6 tabelas (`agentes`, `agente_execucoes`, `agente_execucao_chamadas`, `agente_acoes`, `agente_memoria`, `agente_skills_propostas`), todas com RLS ligado;
   - `get_advisors` tipo `security`: nenhum alerta novo nessas tabelas/funções (em especial nada de `authenticated_security_definer_function_executable` fora das 15 funções de API liberadas de propósito, todas protegidas por `agente_exigir_motor()` ou `is_admin()`, e nenhuma tabela sem RLS). Se houver alerta, explicar cada um; não "resolver" mudando o desenho sem avisar;
   - **rodar de novo só o [schema-testes.sql](schema-testes.sql)** (`begin;` + testes, sem o rascunho) contra o schema já aplicado: 33 de 33 e depois conferir que a contagem de linhas em `agentes` continua 0 e a chave real intacta.
7. **Registrar**: atualizar `SCHEMA.md`, `PLANO.md` e o CLAUDE.md (de "desenhado, NÃO aplicado" para "aplicado em <data>"), e adicionar ao DESAFIOS.md qualquer atrito novo.

## O que fica para depois (não fazer nesta sessão)

- Motor (`supabase/functions/agente/index.ts`), ferramentas e o gerador do módulo de soul/skills/tarefas: sessão de implementação (Sonnet com plano claro). O motor terá de enviar o header `x-agente-chave` em **toda** chamada RPC `agente_*` (PostgREST expõe o header como `request.headers` em minúsculas) e criar o client Supabase de cada execução com o JWT de quem disparou.
- Confirmar ponta a ponta que o secret `AGENTE_MOTOR_CHAVE` da função tem o mesmo valor do Vault (não dá para conferir por MCP): o primeiro `agente_iniciar_execucao` real deve devolver `SOMENTE_MOTOR` se estiver diferente.
- Cadastrar o agente Finix e o usuário-robô dele (`insert into agentes ...`, criação do usuário pela edge function `create-user`): só quando o dono pedir.
- Regra de negócio (D13): ao criar cada ferramenta `escrita_sensivel`, a função de backend que ela chama tem de recusar repetir um efeito já feito.
