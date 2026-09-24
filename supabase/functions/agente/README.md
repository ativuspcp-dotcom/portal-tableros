# functions/agente/

**Status: planejado — nada implementado ainda.** Aqui vai morar o **motor** dos agentes de IA: uma única Edge Function (Deno/TS), no mesmo estilo de `create-user` e `baixa-estoque-epi`. O `index.ts` **ainda não existe de propósito** — uma função vazia poderia ser publicada por engano. Ele nasce na fase de implementação.

Modelo, convenções de banco e decisões em [`agentes/PLANO.md`](../../../agentes/PLANO.md).

## O que o motor faz: uma execução completa, sem chat

Chamado explicitamente pelo código de uma tela (o código escolhe o agente; o motor não roteia nem descobre agentes):

1. Recebe `{ agente, tarefa, entrada }` + o JWT de quem clicou no header `Authorization`. O **tipo** (`execucao_direta` | `pode_propor_acao`), o **modo** e as **ferramentas** vêm do arquivo da tarefa, nunca da requisição; tarefa sem tipo válido não roda.
2. **Valida o JWT de verdade** chamando `/auth/v1/user` e devolve 401 se não for usuário logado (`verify_jwt=true` aceita a anon key pública — ver DESAFIOS.md, seção "Edge functions e anon key"). Não copiar o padrão de só decodificar o payload do JWT.
3. Resolve a identidade da execução conforme a tarefa: **modo usuário** (JWT de quem clicou) ou **modo robô** (usuário-robô do agente). Decisão por agente/tarefa (D2). Em modo robô, **antes** de assumir o robô, confere que o chamador tem o `modulo_exigido` da tarefa em `user_module_permissions` (D7); sem o campo, a tarefa não roda.
4. Monta o contexto: soul do agente + índice de skills (módulo gerado dos `.md`, D1) + ferramentas permitidas + memórias **aprovadas** do agente (lidas ao vivo da tabela) + a entrada da tarefa. **Sem histórico de execuções anteriores.**
5. Chama a API da Anthropic (chave em secret da função, `ANTHROPIC_API_KEY` — criar no Dashboard; o MCP não cria secrets).
6. Executa as ferramentas pedidas (`_shared/ferramentas/`) e repete até a resposta final da tarefa.
7. Grava o **log da execução** (quem/o que disparou, quando, ferramentas usadas, resultado) e devolve o resultado ao chamador.

## Regras (não negociáveis)

- **Nenhuma ferramenta usa `service_role`.** O client Supabase é criado por execução com o JWT do usuário ou do robô, então o RLS das tabelas de negócio vale.
- **Categorias** (declaradas no código de cada ferramenta): `leitura` e `notificacao` são livres em qualquer modo/tipo de tarefa, se a tarefa as declara. `escrita_sensivel` executa direto **só** em `execucao_direta` (o clique é a aprovação), com as ferramentas que a tarefa declara, em modo usuário, argumentos presos à `entrada` e trava contra clique duplo (D9). Em `pode_propor_acao` (inclusive modo robô/agendada) **nunca** executa direto: vira proposta `{ funcao, argumentos }` pendente em `agente_acoes` e só roda após aprovação manual, exatamente como aprovada. O agente nunca escreve direto em tabela: sempre chama função nomeada do backend.
- O motor valida as combinações do arquivo da tarefa em runtime (ferramenta desconhecida, `robo` sem `modulo_exigido`, `execucao_direta` + `robo`, `escrita_sensivel` fora do lugar) e recusa a execução se algo estiver inválido.
- Cada execução lê apenas o cérebro (soul, skills, memória, documentos) do agente chamado.
- Ferramentas que usam `supabase-js`: chamar em sequência, sem `Promise.all` (ver memória do projeto). Chamadas `fetch` ao bridge SAP podem ir em paralelo.
- Limites por execução: iterações do loop, tokens e tempo. Tarefa longa exige desenho assíncrono (a requisição tem limite de tempo).
- Guarda no servidor para tarefas em modo robô: `modulo_exigido` obrigatório (D7 aprovada).
- O próprio bookkeeping do motor (log, propostas, memória) grava só por funções `security definer` (D6 aprovada) — nem o motor usa `service_role`.

## Estrutura prevista

```
functions/
  agente/
    README.md   ← este arquivo
    index.ts    ← (futuro) handler HTTP: auth, contexto, loop de tools, log
  _shared/
    ferramentas/  ← (futuro) uma ferramenta por arquivo; ver README lá
```

Pastas com prefixo `_` em `functions/` não são publicadas como função — são só código compartilhado. Observação: o `app-operacional` tem a própria `supabase/functions/`, mas o motor mora **só aqui**; o app chama por HTTP (`functions.invoke('agente')`), sem duplicar código.
