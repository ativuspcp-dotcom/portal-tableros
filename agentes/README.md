# agentes/

**Status: planejado — nada implementado ainda.** Cada subpasta desta pasta é o **cérebro versionado de um agente de IA nomeado** (o primeiro se chamará Finix): sua identidade ("soul") e suas skills, em Markdown, escritas e atualizadas diretamente pelo dono do projeto. O motor que executa os agentes fica em `supabase/functions/agente/`; o modelo, as convenções de banco e as decisões estão em [PLANO.md](PLANO.md).

## O modelo em três linhas

- Cada agente é **independente**: tem nome próprio e cérebro próprio. Não há setor, módulo ou hierarquia entre agentes.
- **Não há chat**: o agente é acionado para uma tarefa específica e executa do início ao fim.
- **Quem chama é o código**: o botão/tela decide explicitamente qual agente chamar. Não há roteamento automático.

## Por que existe uma pasta no repositório (e não só banco)

- **Soul e skills são comportamento**: mudam de forma deliberada, têm histórico e podem ser revertidas. Por isso ficam em arquivo.
- **Memória e documentos são dados vivos**: nascem e mudam durante o uso, por isso ficam no banco (`agente_memoria`, `agente_documentos`) e **não** têm arquivo aqui. A memória é lida ao vivo da tabela, nunca vai para o bundle.

## Convenção de cada agente

```
agentes/
  README.md
  PLANO.md
  <nome-do-agente>/           # minúsculas, sem acento, kebab-case (ex.: "finix")
    soul.md                   # identidade e regras do agente
    skills/
      <nome-da-skill>.md      # um procedimento por arquivo, nome em kebab-case
    tarefas/
      <nome-da-tarefa>.md     # uma tarefa acionável por botão/tela, por arquivo
```

O nome da pasta é a chave `agente` usada nas tabelas `agente_*` e na chamada do código. Nenhuma pasta de agente existe ainda; cada uma nasce quando o dono do projeto criar o agente.

### `soul.md`

```markdown
---
agente: <nome-da-pasta>
nome: <nome exibido do agente>
---
# Identidade
Quem é o agente, o que ele é para a empresa, tom de voz.

# Escopo
O que ele faz e, principalmente, o que NÃO faz.

# Regras invioláveis
Regras de negócio e segurança (ex.: nunca inventar número de documento).

# Ferramentas
Lista dos nomes das ferramentas (`_shared/ferramentas/`) que este agente pode usar.

# Escrita e aprovação
Regras gerais deste agente sobre escrita (o tipo de cada tarefa, `execucao_direta` ou `pode_propor_acao`, é declarado no arquivo da própria tarefa). Descrever aqui exemplos do que ele nunca deve propor.
```

### `skills/<nome>.md`

```markdown
---
nome: <igual ao nome do arquivo, sem .md>
descricao: <uma linha; é o que o agente vê no índice para decidir se consulta a skill>
versao: 1
---
# <Título>
## Quando usar
## Passos
## Ferramentas usadas
## Cuidados
```

O agente **não** recebe todas as skills no prompt: recebe só o índice (`nome` + `descricao`) e consulta o corpo sob demanda por uma ferramenta. Por isso a `descricao` precisa ser boa.

### `tarefas/<nome>.md`

Cada tarefa é um ponto de entrada acionado por um botão/tela. O código manda só `tarefa` + `entrada`; **tipo, modo e ferramentas vêm deste arquivo**, nunca da requisição. Faltando ou inválido qualquer campo obrigatório, a tarefa não roda.

```markdown
---
tarefa: <igual ao nome do arquivo, sem .md>
descricao: <uma linha>
tipo: execucao_direta | pode_propor_acao
modo: usuario | robo
ferramentas: [ferramenta_a, ferramenta_b]   # tudo que a tarefa usa: leitura, notificacao e, só em execucao_direta, escrita_sensivel
propoe: [ferramenta_x]                      # só pode_propor_acao: ferramentas escrita_sensivel que ela pode PROPOR (lista fechada; padrão: nenhuma)
modulo_exigido: <slug em modules>           # obrigatório se modo: robo — o chamador precisa ter este módulo (D7)
---
# Objetivo
# Entrada esperada
# Passos
# Critério de conclusão
```

- **`execucao_direta`**: o botão é exatamente a ação (ex.: "Faturar pedido X"). O clique do usuário já é a aprovação: executa na hora, sem fila, e **só** com as ferramentas `escrita_sensivel` listadas em `ferramentas`. **Obrigatoriamente** `modo: usuario` (D9-a) e com argumentos das escritas presos à `entrada` (D9-b); há trava contra clique duplo (D9-c).
- **`pode_propor_acao`**: investigação/análise (ex.: "Investigar OP atrasada"). O agente decide o que ler e **nunca executa escrita sensível direto**, em nenhum modo; pode propor as de `propoe` (a chamada exata: função + argumentos), que caem pendentes aguardando aprovação manual (em lote ou uma a uma). É o único tipo que usa a fila de aprovação. Uma tarefa que só lê e notifica (ex.: `resumo-diario`, modo robô, agendada, envia relatório por e-mail) é `pode_propor_acao` com `propoe` vazio.
- **`modo: robo`** exige `modulo_exigido`: o motor confere no servidor que quem chamou tem esse módulo antes de assumir a identidade do robô (D7). Sem o campo, a tarefa não roda.
- **Ferramentas por categoria:** `leitura` e `notificacao` (e-mail, relatório, mensagem — não alteram nada no negócio) são livres em qualquer modo e tipo, desde que listadas em `ferramentas`; `escrita_sensivel` (faturar, emitir MDF-e, alterar/adicionar registro) segue as regras acima. Quer que o cron também edite dados de negócio? O caminho é `pode_propor_acao` em modo robô: propor + aprovar. Não há atalho.
- Ambos os tipos geram log completo em `agente_execucoes`.

## Regras para o conteúdo dos arquivos

- Sem segredos, tokens, senhas, PINs ou dados pessoais de funcionários/clientes.
- Sem IDs fixos de registros do banco (usar critério de busca, não UUID).
- O agente **nunca edita** estes arquivos em tempo de execução. Ele só *propõe* (tabela `agente_skills_propostas`, `status = 'pendente'`); depois de aprovada, a skill vira arquivo aqui **via PR**.
- Nenhum agente lê o cérebro de outro. Compartilhar fonte de dados ou memória entre agentes é decisão pontual e explícita do dono do projeto.
