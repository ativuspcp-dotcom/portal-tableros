# Schema dos agentes: desenho (APLICADO em 2026-09-24)

Status em 2026-09-24: **aplicado no banco** (migration `agentes_base`, espelho em `supabase/migrations/20260924_agentes_base.sql`; 6 tabelas com RLS, 15 funções de API liberadas, 0 linhas de dados). O SQL de origem está em [schema-rascunho.sql](schema-rascunho.sql) (mantido como referência; a fonte de verdade agora é a migration) e foi **testado dentro de uma transação que termina em erro** (rollback garantido; conferido depois que nada ficou no banco). Resultado: **33 de 33 testes passaram** ([schema-testes.sql](schema-testes.sql)). **D10–D14 aprovadas em 2026-09-24** e a chave do motor já foi cadastrada pelo dono do projeto (Vault `agente_motor_chave` e secret `AGENTE_MOTOR_CHAVE` da função). A bateria voltou a dar 33 de 33 contra o schema já aplicado. Roteiro seguido: [APLICAR.md](APLICAR.md).

## Tabelas

| Tabela | Para quê | Quem lê (RLS) | Quem escreve |
|---|---|---|---|
| `agentes` | Cadastro: `slug` (= pasta `agentes/<slug>/`), nome, `robo_user_id`, ativo | admin | Só migration/SQL (sem RPC) |
| `agente_execucoes` | Log de cada acionamento: tarefa, tipo, modo, quem disparou, como quem executou, entrada + hash, status, resultado, tokens | admin + **o próprio disparador** (a tela precisa do resultado) | Funções do motor |
| `agente_execucao_chamadas` | Cada ferramenta chamada: categoria, argumentos, resultado; destinatário/assunto/hash nas notificações (N4) | admin (pode conter dado lido com poder do robô) | Funções do motor |
| `agente_acoes` | Fila de propostas `{ ferramenta, argumentos }` + hash, justificativa, filial, decisão, resultado | admin | Motor propõe; admin decide |
| `agente_memoria` | Fatos do agente; o motor só carrega `aprovada` (máx. 100, mais recentes) | admin | Motor propõe; admin decide/cria |
| `agente_skills_propostas` | Skill proposta → aprovada → `incorporada` (exige link do PR) | admin | Motor propõe; admin decide |

Mudanças em relação à lista original: `agente_conversas`/`agente_mensagens` caíram (não há chat) → `agente_execucoes`; entrou `agente_execucao_chamadas` (auditoria por chamada, com trigger que impede reescrever o histórico); `agente_aprovacoes` foi fundida em `agente_acoes` (D11); `agente_documentos` adiada (D12).

## Como a segurança é garantida

- **Nenhuma policy `using (true)`**, nenhuma policy de INSERT/UPDATE/DELETE, `revoke all` de `anon`. Só `select` para `authenticated`, filtrado por `is_admin()` (e o disparador nas próprias execuções).
- **Toda escrita é por função `security definer`** (D6), com `search_path` fixo. Helpers internos e triggers sem `EXECUTE` para ninguém.
- **Âncora de isolamento**: toda função do motor recebe um `execucao_id` e só age se a execução está em andamento, tem menos de 10 min e **foi disparada pelo próprio chamador**. O agente de tudo que se grava ou lê (memória, proposta, chamada) sai **dessa execução**, nunca de um `agente_id` passado como parâmetro. Um agente não enxerga o cérebro de outro.
- **Só o motor chama as funções de bookkeeping** (D10): elas exigem o header `x-agente-chave`, conferido contra o segredo `agente_motor_chave` no Vault.
- **D9** no banco: `execucao_direta` + `robo` bloqueado por CHECK e na função; escrita sensível só em execução direta, **uma vez por ferramenta por execução** (índice único); clique duplo bloqueado por chave de idempotência + índice único de execução em andamento com a mesma entrada; proposta sai de `pendente` uma única vez (lock + trigger de transição).
- **Propostas imutáveis**: trigger impede alterar ferramenta/argumentos/hash (testado: nem superusuário consegue); na execução o hash é recalculado e comparado com o gravado **e** com o hash que a tela mostrou ao aprovador; filial da proposta tem de estar nas filiais do aprovador; proposta vence em 7 dias; proposta idêntica pendente não se duplica (cron diário).
- **Notificação e escrita são reservadas antes do efeito** (`executando`) e concluídas depois: o limite de 20 notificações/execução (N2) vale antes de enviar, e o log existe mesmo se o motor cair no meio.
- **D7**: tarefa robô sem `modulo_exigido` ou chamador sem o módulo (`can_view`, admin passa) é recusada antes de assumir o robô.
- Execução abandonada (edge function caiu) expira em 10 min e libera a trava.

## Fluxos

**Execução** (motor, JWT de quem clicou + `x-agente-chave`): `agente_iniciar_execucao` → `agente_carregar_memorias` → loop: leitura/recusa = `agente_registrar_chamada`; notificação/escrita = `agente_reservar_chamada` → efeito → `agente_concluir_chamada`; propostas = `agente_propor_acao` / `_memoria` / `_skill` → `agente_finalizar_execucao`.

**Aprovação** (tela do portal → edge function, JWT do admin + chave): para cada item do lote, em sequência: `agente_acao_iniciar_execucao(id, hash_visto, lote)` → edge function confere que a ferramenta está em `propoe` da tarefa de origem, valida os argumentos contra o esquema da ferramenta e a executa com o JWT do admin → `agente_acao_finalizar`. Rejeitar (`agente_acoes_rejeitar`, em lote) e curadoria (`agente_memoria_decidir`, `agente_memoria_criar`, `agente_skill_decidir`) são chamadas direto pelo portal.

## Decisões novas (surgiram no desenho) — TODAS APROVADAS em 2026-09-24

**D10 — Como o banco sabe que quem grava é o motor.** Todas as RPCs são chamáveis por qualquer usuário logado via `/rest/v1/rpc/...`. Sem proteção, um usuário comum poderia criar execuções falsas e **enfileirar propostas que parecem do agente** (ex.: "faturar pedido X"), esperando um admin aprovar.
- A) **Chave do motor** num header, conferida contra o Vault. Prós: bloqueia a forja sem `service_role`; testado. Contras: um segredo em dois lugares (Vault + secret da função); se vazar, é preciso trocar nos dois.
- B) Aceitar o risco: a proposta mostra quem disparou e o admin revisa. Prós: nada a configurar. Contras: "o agente propôs" deixa de ser confiável; depende 100% da atenção de quem aprova.
- C) `service_role` só para o bookkeeping. Contraria a D6 aprovada.
- **Recomendação: A** (já implementada no rascunho). **APROVADA.**

**D11 — `agente_aprovacoes` separada ou dentro de `agente_acoes`.** Cada ação é decidida uma única vez.
- A) **Colunas na própria `agente_acoes`** (`decidida_por`, `decidida_em`, `lote_id`, `motivo_rejeicao`), protegidas pelo trigger. Prós: sem join, transição atômica numa linha só, menos código. Contras: se um dia houver aprovação em múltiplas etapas (dois aprovadores), precisa de tabela.
- B) Tabela separada. Prós: histórico de várias decisões por ação. Contras: join e duas escritas por decisão para um caso que hoje não existe.
- **Recomendação: A** (YAGNI; já implementada). **APROVADA.**

**D12 — `agente_documentos` (base de conhecimento com busca semântica).** Exige escolher o gerador de embeddings: a Anthropic não oferece embeddings. Opções: Voyage AI (qualidade alta, conta e chave a mais, custo por uso) ou o modelo `gte-small` embutido nas Edge Functions do Supabase (grátis, sem chave, qualidade menor em português). Ainda não há nenhuma tarefa que precise disso.
- **Recomendação: adiar** a tabela e a extensão `vector` até a primeira tarefa que precisar; decidir o provedor nessa hora. **APROVADO adiar.**

**D13 — Repetir uma escrita direta depois de concluída.** O banco já impede clique duplo e retentativa. Mas dois cliques **separados** em "Faturar pedido X" (um minuto depois, por exemplo) são duas execuções legítimas para o banco.
- A) **A função de negócio é idempotente** (ex.: a função de faturar recusa pedido já faturado). Prós: é a camada certa, protege também quem chama sem agente; não bloqueia repetições legítimas de outras tarefas. Contras: exige disciplina em cada função `escrita_sensivel`.
- B) Bloquear para sempre a mesma tarefa com a mesma entrada. Contras: impede repetições legítimas (ex.: reenviar um e-mail, refazer após correção).
- **Recomendação: A**, virando regra: toda ferramenta `escrita_sensivel` chama uma função de backend que recusa repetir um efeito já feito. **APROVADA** (a idempotência da escrita sensível é responsabilidade da função de negócio, não só do banco de agentes).

**D14 — Onde fica a senha do usuário-robô.** O motor precisa logar como robô em modo robô.
- A) **Secret da edge function** (`AGENTE_ROBO_<SLUG>_SENHA`, criado no Dashboard). Prós: só a função lê; nada no banco. Contras: criação manual no Dashboard (o MCP não cria secrets).
- B) Vault. Contras: para o motor ler, seria preciso uma RPC que devolve a senha (exposta a qualquer logado, protegida só pela chave do motor) ou `service_role`.
- **Recomendação: A** para o motor. O Vault fica para o `pg_cron`, quando as rotinas agendadas voltarem (lá a leitura é dentro do banco). **APROVADA.**

## Antes de aplicar (checklist) — situação em 2026-09-24

1. ~~Aprovar D10–D14~~ feito.
2. ~~Cadastrar a chave~~ feito pelo dono do projeto, fora da conversa. Conferido só em leitura: existe 1 segredo `agente_motor_chave` no Vault com 32 ou mais caracteres. **Não dá para conferir daqui** se o secret `AGENTE_MOTOR_CHAVE` da edge function tem o mesmo valor (o MCP não lê secrets); só o teste ponta a ponta do motor mostrará. Esse teste é parte da implementação do motor.
3. ~~Aplicar~~ feito em 2026-09-24 ([APLICAR.md](APLICAR.md)).
4. Cadastro do Finix e do robô dele: só quando você pedir (não semear agente sem pedido).
