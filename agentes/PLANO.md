# Plano dos agentes de IA

Documento de continuidade: permite compactar/abrir nova sessão sem perder as decisões. Status: **schema aplicado em 2026-09-24** (6 tabelas `agente_*` + funções, sem dados); motor, ferramentas e agentes ainda não existem.

> **Revisão de escopo (2026-09-24):** o modelo anterior ("agente por setor", com dono de setor, permissões por módulo e chat) foi **substituído** pelo modelo de *agente nomeado e independente, chamado explicitamente do código*. Não existe mais conceito de setor, módulo de agente nem dono de setor. `user_module_permissions` e `department` não têm relação com os agentes.

## 1. O modelo

- Cada **agente** é uma entidade própria, com **nome próprio** (o primeiro se chama **Finix**). Não pertence a setor, módulo ou departamento.
- Cada agente tem seu **cérebro isolado** em `agentes/<nome-do-agente>/` (`soul.md` + `skills/*.md`), escrito e atualizado diretamente pelo dono do projeto — é a fonte de verdade do que aquele agente sabe e faz.
- **Não existe chat.** O agente é acionado para **uma tarefa específica**, executada do início ao fim numa única execução. Não há conversa contínua nem histórico conversacional recarregado entre execuções.
- **Quem chama é o código.** O dono do projeto decide, tarefa por tarefa, onde cada agente é chamado (ex.: o botão "Conferir pedido" chama diretamente o agente Finix passando os dados da tela). **Não há roteamento automático nem descoberta dinâmica** de qual agente usar.
- Vários agentes = pastas paralelas e independentes em `agentes/`, sem hierarquia. Só compartilham fonte de dados ou memória por **decisão pontual explícita**, nunca por regra geral.

## 2. Onde mora cada coisa

| Coisa | Onde | Versionada? |
|---|---|---|
| Cérebro do agente (soul + skills aprovadas + tarefas) | `agentes/<nome>/soul.md`, `skills/*.md`, `tarefas/*.md` | Sim (git) |
| Motor (uma execução: contexto + loop LLM/tools) | `supabase/functions/agente/index.ts` | Sim |
| Ferramentas | `supabase/functions/_shared/ferramentas/*.ts` | Sim |
| Memória, log de execuções, ações pendentes, aprovações, documentos, skills propostas | tabelas `agente_*` (migrations em `supabase/migrations/`) | Schema sim, dados não |
| Botão/tela que aciona o agente | código do portal ou do app-operacional | Sim |

Tabelas previstas (a confirmar na sessão de schema): `agentes`, `agente_execucoes` (log: quem/o que disparou, quando, ferramentas usadas, resultado — **substitui** `agente_conversas` e `agente_mensagens`, que deixam de existir por não haver chat), `agente_memoria`, `agente_skills_propostas`, `agente_acoes`, `agente_aprovacoes`, `agente_documentos`.

## 3. Fluxo de uma execução

1. O código da tela chama o motor com `{ agente: '<nome>', tarefa: '<id>', entrada: {...} }` e o JWT de quem clicou. O nome do agente é sempre explícito no código.
2. O motor valida o JWT (`/auth/v1/user`), carrega o cérebro daquele agente (soul + índice de skills, do módulo gerado — D1) e as memórias **aprovadas** dele (ao vivo da tabela).
3. Roda o loop LLM + ferramentas até a resposta final da tarefa.
4. Ferramentas de **leitura** e de **notificação** executam (desde que a tarefa as declare). **Escrita sensível** depende do **tipo da tarefa** (ver abaixo): ou executa na hora (`execucao_direta`) ou vira proposta pendente (`pode_propor_acao`).
5. Grava o log da execução e devolve o resultado ao chamador.

### Categorias de ferramenta

Cada ferramenta em `_shared/ferramentas/` declara **no próprio código** a sua `categoria`. O modelo e o arquivo da tarefa nunca definem categoria; categoria ausente ou inválida = a ferramenta não carrega (falha fechada). Em dúvida entre duas categorias, vale a mais restritiva.

| Categoria | O que é | Regra |
|---|---|---|
| `leitura` | Consulta sem efeito (Supabase, SAP) | Livre |
| `notificacao` | **Não altera nada no negócio**: só informa ou gera saída (enviar e-mail, gerar e postar relatório, enviar mensagem). Não é escrita sensível, mesmo "escrevendo" algo | **Livre em qualquer modo e tipo de tarefa**, desde que a tarefa a liste em `ferramentas`. D9 e fila de aprovação **não** se aplicam |
| `escrita_sensivel` | Consequência real no negócio: faturar, emitir MDF-e, alterar/adicionar registro de negócio | D9 + fila de aprovação (D8), **em qualquer modo** |

Fronteira: uma notificação não pode ter efeito sobre tabela ou documento de negócio. Se tiver (ex.: "avisar o cliente **e marcar** o pedido como avisado"), é `escrita_sensivel`.

**Regra de ouro:** o agente **nunca escreve direto no banco, em nenhum cenário.** Uma ferramenta `escrita_sensivel` é sempre a **chamada a uma função nomeada do backend** (função `security definer` ou edge function) com argumentos explícitos — nunca `insert`/`update`/`delete` em tabela de negócio. Executar ou propor é sempre sobre essa chamada exata: `{ funcao, argumentos }`.

**Salvaguardas de `notificacao` (N1–N4 APROVADAS em 2026-09-24, obrigatórias para toda ferramenta dessa categoria).** "Livre" significa sem fila de aprovação, não sem limites, porque uma notificação leva dado para fora e o modelo lê dados externos (risco de prompt injection):
- **N1 — Destinatário fixo na tarefa, nunca escolhido pelo modelo.** Fica na declaração da tarefa (ou na configuração da ferramenta); o modelo só fornece o conteúdo.
- **N2 — Limite de envios por execução.**
- **N3 — Só destino interno é notificação.** Mensagem a terceiros (cliente, fornecedor), que gera consequência de negócio, é `escrita_sensivel`.
- **N4 — Registro no log** de destinatário, assunto e resumo/hash do conteúdo de cada notificação.

### Tipos de tarefa (propriedade de cada arquivo de tarefa)

Cada tarefa é um arquivo no cérebro do agente (`agentes/<nome>/tarefas/<tarefa>.md`, ver D5) e **declara o próprio tipo**. O tipo, o modo de identidade e as ferramentas vêm **sempre do arquivo da tarefa** (que chega ao motor pelo módulo gerado, D1) — nunca da requisição nem do modelo. Tipo ausente ou inválido = a tarefa **não roda** (falha fechada); não existe tipo padrão.

| | `execucao_direta` | `pode_propor_acao` |
|---|---|---|
| Quando | O botão **é** a ação (ex.: "Faturar pedido X") | O agente investiga/analisa com liberdade (ex.: "Investigar OP atrasada", "resumo-diario") |
| Aprovação | **O clique do usuário já é a aprovação.** Executa na hora, sem fila | Só se o agente quiser propor uma escrita sensível **não pedida**: a proposta cai pendente em `agente_acoes`, aguardando aprovação manual (D8) |
| `leitura` e `notificacao` | Livres, se declaradas em `ferramentas` | Livres, se declaradas em `ferramentas` |
| `escrita_sensivel` | Pode **chamar direto**, mas só as que a própria tarefa declara em `ferramentas` — nunca uma que a tarefa não previu. **D9 obrigatória; só modo usuário** | **Nunca executa direto.** Só pode *propor* as listadas em `propoe`. D8 (fila) e D9-b/c na execução aprovada |
| Fila de aprovação | **Não usa** | **Usa** (é o único tipo que usa) |
| Log (`agente_execucoes`) | Registra tudo (tipo, modo, ferramentas, argumentos e resultado das chamadas; destinatário/assunto das notificações) | Igual, mais as propostas geradas |

Enforcement no motor (defesa em profundidade): ferramenta não declarada pela tarefa nem sequer é oferecida ao modelo; se ele pedir mesmo assim, o motor recusa e registra no log. As combinações inválidas são rejeitadas **já na geração do módulo (D1)** e de novo em runtime: ver D5.

### Resposta padrão: "posso automatizar uma escrita sensível no cron sem aprovação?"

**Não.** O caminho é **propor + aprovar**: tarefa `pode_propor_acao` em modo robô; o agente lê os dados, monta a chamada exata (nome da função + argumentos) e ela cai pendente na fila; você aprova (em lote ou uma a uma) e só então a função roda. Isso vale mesmo que a tarefa tenha sido programada e agendada por você: essa autorização cobre **ler, analisar e notificar**, não alterar o negócio. Não existe exceção de escrita sensível em modo robô.

Exemplo do que **pode** rodar sem aprovação: `resumo-diario` — modo robô, agendada via `pg_cron` toda manhã, analisa dados e **envia um relatório por e-mail**. Usa só `leitura` + `notificacao`; a autorização é o fato de ter sido programada e agendada. É `pode_propor_acao` com `propoe` vazio (aprovado: `execucao_direta` é para quando há escrita sensível direta; tarefa só de ler e notificar usa `pode_propor_acao` sem `propoe`, e ganha a capacidade de propor no dia em que `propoe` for preenchido).

## 4. Identidade de quem aciona (decidida por agente/tarefa)

- **Modo usuário:** quando a ação é sensível a quem clicou (ex.: respeitar a filial), as ferramentas usam o **JWT desse usuário**; o RLS das **tabelas de negócio** filtra normalmente.
- **Modo robô:** quando a ação não depende de quem clicou, basta o **usuário-robô do próprio agente** (usuário real no Auth, permissão mínima, credencial no Vault). Um robô por agente.
- Em ambos os casos, **quem vê o botão é decisão de UI** da tela (ex.: só aparece para quem já tem acesso àquela tela hoje), não uma regra nova do sistema de agentes.
- **Ponto de atenção (D7):** só a UI protegendo o botão significa que qualquer usuário logado consegue chamar o motor direto por HTTP. No modo usuário, o RLS de negócio ainda protege os dados. No **modo robô**, isso é uma escalada: um logado qualquer obtém leituras com o poder do robô. Ver D7.

## 5. Regras de segurança (inegociáveis)

1. Ferramentas que tocam tabelas de negócio usam o client do contexto da execução: JWT do usuário (modo usuário) ou do robô do agente (modo robô). **Nunca `service_role` em ferramenta.**
2. **`escrita_sensivel` só executa direto em tarefa `execucao_direta`, e só as ferramentas que a tarefa declara** (o clique do usuário é a aprovação), com D9. Em tarefa `pode_propor_acao`, ela **nunca executa direto**: vira proposta pendente `{ funcao, argumentos }` em `agente_acoes`/`agente_aprovacoes` até aprovação manual — inclusive em modo robô e em tarefa agendada. `leitura` e `notificacao` são livres em qualquer modo/tipo, se a tarefa as declara. **O agente nunca escreve direto em tabela**: sempre chama uma função nomeada do backend.
3. Memórias e skills que o agente aprender sozinho nascem `status = 'pendente'` e só valem depois de aprovadas. Skill aprovada vira `.md` versionado via PR; **memória é lida ao vivo da tabela, nunca entra em bundle**.
4. **Cérebros isolados por agente:** toda linha de memória/documento/skill proposta pertence a um `agente_id`, e uma execução só lê o que é do agente que está rodando. Compartilhamento entre agentes só por decisão pontual explícita (tabela ou coluna criada para aquele caso), nunca por padrão.
5. **`using (true)` e `with check (true)` são proibidos em qualquer tabela `agente_*`** (as tabelas de produção usam esse padrão; não copiar). Toda migration de agentes é conferida contra isso e por `get_advisors` antes de aplicar.
6. O motor valida o JWT via `/auth/v1/user` (401 se não for usuário logado); `verify_jwt=true` sozinho aceita a anon key.
7. Autorização nunca em `user_metadata`.
8. **Toda execução é registrada** (quem/o que disparou, quando, tipo e modo da tarefa, ferramentas usadas, argumentos e resultado das escritas, destinatário/assunto das notificações), inclusive as `execucao_direta` — o log é a auditoria delas.
9. Limites por execução: nº máximo de iterações do loop, tokens e tempo. A requisição da edge function tem limite de tempo; tarefa longa exige desenho assíncrono (execução em segundo plano + o botão consulta o log).

## 6. Convenções do banco a respeitar (levantadas das migrations e do banco em 2026-09-24)

**Arquivos e nomes**
- Migration: `supabase/migrations/YYYYMMDD_descricao_em_snake_case.sql`, só data, com comentário de cabeçalho em português explicando o porquê. O banco remoto grava `YYYYMMDDHHMMSS_nome` (via `apply_migration`); o arquivo local é espelho manual — ao aplicar, usar como `name` a parte depois da data.
- Tabelas: snake_case em português com prefixo do domínio (`pcp_`, `expedicao_`, ...). `agente_*` segue o padrão; `agentes` (sem prefixo) é aceitável como cadastro-raiz. Não imitar as exceções soltas (`amarracoes`, `secagem_apontamentos`).
- `supabase/schema.sql` é só o esqueleto inicial (6 tabelas) e está defasado; a fonte de verdade é o banco + as migrations.

**Colunas**
- PK `id uuid primary key default gen_random_uuid()`; `created_at timestamptz not null default now()`; autoria `created_by uuid references auth.users(id)`; `updated_at` com o trigger existente `public.update_updated_at_column()`.
- Valores tipo enum: `text` + `check (col in (...))`, não `CREATE TYPE`. Status em minúsculas e português (`pendente`, `aprovada`, `rejeitada`).
- Payloads de ferramenta/ação: `jsonb`.
- Multi-filial: tabelas de negócio têm `bpl_id integer`; o acesso do usuário vem de `user_profiles.filiais_permitidas` (jsonb, padrão `[1]`). Vale no modo usuário; no modo robô, definir explicitamente as filiais que o robô enxerga.

**RLS e funções**
- Toda tabela: `enable row level security`, com predicados reais (requisito 5 acima). Base de referência: `public.is_admin()` / `public.is_super_admin()` (leem `user_profiles.role`), nunca `user_metadata`.
- Escrita sensível **só por função** `security definer` (padrão `salvar_setup_secador`: tabela sem policies de INSERT/UPDATE/DELETE).
- Função `security definer`: `set search_path to 'public'`, depois `revoke all ... from public, anon` + `grant execute ... to authenticated`. Função só-de-trigger: `revoke execute ... from public, anon, authenticated`. Tabela interna: RLS ligado **sem policy** + `revoke all ... from anon, authenticated`. (PostgREST expõe toda função pública como RPC.)
- Função que depende de `validar_pin` e vai gravar tentativa: devolver vazio em vez de `raise exception`.
- Depois de cada migration: `get_advisors` (security).

**Extensões** (consultado no projeto): `pg_net` e `supabase_vault` instalados; `vector` 0.8.0 (embeddings de `agente_documentos`) e `pg_cron` 1.6.4 disponíveis, **não instalados** — instalar na migration que precisar.

## 7. Decisões

**D1 — Como o motor lê soul/skills: APROVADA (A), mantida.** Um script gera um módulo TS com o conteúdo dos `.md` antes do deploy (a edge function só empacota a própria pasta; `agentes/` fica fora do bundle). Vale **só para soul/skills**; memória, log, ações e documentos são sempre lidos das tabelas. O modelo novo não muda a decisão, mas muda o custo: como o dono edita os `.md` diretamente e com frequência, cada ajuste exige regenerar o módulo e republicar a função. Mitigação: um único comando (gerar + publicar). Se a fricção pesar, a alternativa B (sincronizar os `.md` para uma tabela no deploy) continua disponível.

**D2 — Identidade da execução: REVISADA.** Não há regra geral. **Cada agente/tarefa declara** se roda em modo usuário (JWT de quem clicou) ou modo robô (usuário-robô do próprio agente, um por agente, permissão mínima, credencial no Vault). Nada de `service_role` em nenhum dos dois. A escolha fica registrada junto da definição da tarefa (ver D5) e no log da execução.

**D3 — Mapeamento agente↔setor: DESCARTADA.** Não existe setor. `user_profiles.department` e `modules` não entram no modelo dos agentes.

**D4 — Ação aprovada: APROVADA, restrita às propostas.** Só vale para ações da fila (tarefas `pode_propor_acao`, qualquer modo, inclusive robô/agendada); em `execucao_direta` não há aprovador — quem executa é quem clicou, com o próprio JWT. A proposta é a chamada exata `{ funcao, argumentos }`. Para as propostas: executa com o JWT de quem **aprovou**, revalidando permissão na hora, sobre payload imutável (guardar hash) que o aprovador vê exatamente como será executado. A aprovação pode ser **em lote ou uma a uma**. Ajustes: (a) o aprovador é quem o D8 definir; (b) se a proposta nasceu em modo usuário, o payload guarda a filial de origem e a execução revalida que o aprovador enxerga essa filial (proposta de modo robô: revalida as filiais do robô); (c) a função executada tem de constar em `propoe` da tarefa de origem (D5) e ser `escrita_sensivel`.

**Decisões aprovadas em 2026-09-24 (todas fechadas; o que resta é o desenho do schema):**

- **D5 — O que é uma "tarefa": APROVADA (B).** Cada tarefa é um arquivo em `agentes/<nome>/tarefas/<tarefa>.md`; a tela (ou o cron) manda só `tarefa` + dados. O frontmatter declara `tipo` (`execucao_direta` | `pode_propor_acao`), `modo` (`usuario` | `robo`), `ferramentas` (tudo que a tarefa usa: `leitura`, `notificacao` e, **só em `execucao_direta`**, `escrita_sensivel`), `propoe` (só `pode_propor_acao`: lista fechada das ferramentas `escrita_sensivel` que ela pode **propor**, **padrão "nenhuma"**) e `modulo_exigido` (**obrigatório** quando `modo: robo`, ver D7). Formato completo em [README.md](README.md). **Validação na geração do módulo (D1), repetida em runtime**, rejeitando: ferramenta desconhecida; `modo: robo` sem `modulo_exigido`; `execucao_direta` com `modo: robo`; `escrita_sensivel` em `ferramentas` de `pode_propor_acao`; item de `propoe` que não seja `escrita_sensivel`.
- **D6 — Escrita em `agente_*` sem `service_role`: APROVADA (A).** Escritas só por funções `security definer` com `execute` para `authenticated`; cada função valida o `agente_id` e nunca confia nele sem checagem. Predicado das tabelas `agente_*` é por agente: leitura direta só para `is_admin()` (mais o próprio disparador nas linhas de execução dele); nenhuma policy de INSERT/UPDATE/DELETE. O motor não usa `service_role` nem para o próprio bookkeeping.
- **D7 — Guarda no servidor para o modo robô: APROVADA (B).** Toda tarefa com `modo: robo` declara `modulo_exigido` (slug de um módulo já existente em `modules`, o mesmo que dá acesso à tela do botão) e o motor confere em `user_module_permissions` que o **chamador** tem esse módulo (`can_view`; admin passa, como no resto do projeto) **antes** de assumir a identidade do robô. Sem `modulo_exigido`, a tarefa robô não roda. Replica no servidor a condição que a UI já usa para mostrar o botão; não é regra nova de acesso. (`user_module_permissions` é só a permissão do chamador; não tem relação com o agente.)
- **D8 — Quem aprova: APROVADA.** As propostas de ação (tarefas `pode_propor_acao`) e as memórias/skills pendentes são aprovadas por `is_admin()` por padrão, com uma tela simples de aprovação no portal (fora do escopo por ora), com aprovação em lote ou individual. `execucao_direta` **não passa por D8**.
- **D9 — Salvaguardas da `escrita_sensivel`: APROVADAS (a, b, c), obrigatórias para toda ferramenta dessa categoria** (não se aplicam a `leitura` nem a `notificacao`), aplicadas pelo motor, não pelo modelo:
  - (a) **Execução direta só em modo usuário.** Escrita sensível direta em modo robô deixaria qualquer logado disparar escrita com o poder do robô. Combinação `execucao_direta` + `robo` é rejeitada. Em modo robô a escrita sensível só existe como **proposta** (`pode_propor_acao`).
  - (b) **Argumentos presos.** Na execução direta, os argumentos da escrita vêm da `entrada` da tarefa (validados pelo motor) e cada ferramenta `escrita_sensivel` roda no máximo uma vez por execução. Nas **propostas aprovadas**, "presos" significa: o payload `{ funcao, argumentos }` gravado é imutável (hash verificado no momento de executar), validado contra o esquema de argumentos da função, e executado **exatamente como aprovado**, sem o modelo reinterpretar nada. (Interpretação para propostas — não existe "entrada de um clique" numa tarefa agendada — **aprovada em 2026-09-24**.)
  - (c) **Idempotência.** Execução direta: trava por `tarefa` + hash da `entrada` enquanto houver execução em andamento (ou chave de idempotência), contra clique duplo. Propostas: transição atômica `pendente → executando → executada`, para que uma proposta rode uma única vez mesmo com duplo clique na aprovação ou retentativa (vale item a item nos lotes).

**Fora do escopo de implementação agora (confirmado):** rotinas agendadas (`pg_cron`). Voltam pelo modo robô quando for criada a primeira tarefa desse tipo (`resumo-diario`). Pontos a definir **nessa ocasião**: (1) como o cron autentica como robô (o token expira; login a cada execução com credencial no Vault); (2) como a D7 se aplica quando o "chamador" é o próprio robô e não há humano; (3) destinatário fixo do e-mail (N1); (4) idempotência da agenda (não enviar duas vezes no mesmo dia); (5) instalar `pg_cron`/`pg_net` e versionar o job em migration.

## 8. Próximos passos

1. ~~Fechar D5–D9~~ (feito em 2026-09-24). Falta só o usuário definir o nome/tarefas do primeiro agente, Finix, quando quiser começar o cérebro dele.
2. **Sessão de schema — FEITA e APLICADA em 2026-09-24: ver [SCHEMA.md](SCHEMA.md).** D10–D14 aprovadas e chave do motor cadastrada; migration `agentes_base` aplicada ([APLICAR.md](APLICAR.md)). Escopo original: tabelas `agente_*` + RLS/RPC por agente + advisors. Pontos a desenhar: `agente_execucoes` (log completo + trava de idempotência da D9-c, ex.: índice único parcial em execuções em andamento), `agente_acoes`/`agente_aprovacoes` (payload `{ funcao, argumentos }` imutável + hash, filial de origem, função da lista `propoe`, aprovação em lote ou individual, transição atômica `pendente → executando → executada`), `agente_memoria` e `agente_skills_propostas` (`status = 'pendente'`), `agente_documentos` (embeddings com `vector`), o usuário-robô por agente (criação via edge function `create-user`, credencial no Vault) e as funções `security definer` de escrita (D6). Requisito inegociável: nenhum `using (true)`/`with check (true)`.
3. Motor + primeiras ferramentas de leitura — com plano claro: **Sonnet**.
4. Cérebro do Finix (soul/skills) — escrito por você; formatação pode ser **Sonnet**.
5. Movimentações mecânicas — **Haiku**.
