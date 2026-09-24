# functions/_shared/ferramentas/

**Status: planejado — nenhuma ferramenta implementada ainda.** Cada ferramenta (tool) que um agente pode chamar mora aqui, uma por arquivo. Uma ferramenta é uma função TS que consulta o Supabase ou o bridge SAP em nome do usuário logado.

## Contrato de cada ferramenta

Cada arquivo exporta a mesma forma (a definir na implementação, mas com estes campos):

- `nome` — snake_case, único (ex.: verbo + objeto). É o que vai em `# Ferramentas` do `soul.md`.
- `descricao` — texto que o modelo lê para decidir usar a ferramenta.
- `parametros` — JSON Schema da entrada.
- `categoria` — **obrigatória**, declarada aqui no código (nunca pelo modelo nem pelo arquivo da tarefa): `'leitura'`, `'notificacao'` ou `'escrita_sensivel'`. Ausente ou inválida = a ferramenta não carrega. Em dúvida, a mais restritiva.
- `executar(ctx, entrada)` — `ctx` traz o client Supabase **criado com o JWT da execução** (de quem clicou ou do robô do agente, conforme a tarefa), o `agente`, o `modo` (`'usuario'` ou `'robo'`) e o `user_id` de quem disparou.

## Regras

1. **Sem `service_role`, nunca.** Só o client do `ctx`. Assim o RLS das tabelas de negócio vale para o agente.
2. **Categorias e o que o motor faz com cada uma** (a ferramenta só é oferecida ao modelo se a tarefa a declara):
   - `leitura`: livre.
   - `notificacao`: **não altera nada no negócio**, só informa ou gera saída (e-mail, relatório, mensagem). Livre em qualquer modo e tipo de tarefa. Não pode ter efeito sobre tabela ou documento de negócio — se tiver, é `escrita_sensivel`. Salvaguardas N1–N4 (aprovadas, obrigatórias): destinatário fixo na tarefa (o modelo só fornece o conteúdo, nunca o destino), limite de envios por execução, só destino interno (mensagem a cliente/fornecedor é `escrita_sensivel`), e registro de destinatário, assunto e hash do conteúdo no log.
   - `escrita_sensivel`: consequência real no negócio (faturar, emitir MDF-e, alterar/adicionar registro). Só executa direto em tarefa `execucao_direta` que a declara em `ferramentas`, em modo usuário, com argumentos vindos da `entrada` (validados pelo motor), uma vez por execução e com trava de idempotência (D9). Em `pode_propor_acao` (qualquer modo) **nunca** executa direto: só *registra a proposta* `{ funcao, argumentos }` em `agente_acoes` (status `pendente`), se estiver em `propoe`; a execução ocorre depois da aprovação, por outro caminho que revalida a permissão e executa exatamente o payload aprovado.
   - **Ferramenta `escrita_sensivel` = chamada a uma função nomeada do backend** (`security definer` ou edge function) com argumentos explícitos. Nunca `insert`/`update`/`delete` direto em tabela de negócio.
3. **Leitura sempre limitada**: todo `select` com `limit` e colunas explícitas (a tabela `amarracoes` tem milhares de linhas; `pages/producao/amarracoes.js` já pagina de 50 em 50). Nunca devolver tabela inteira ao modelo.
4. **Saída enxuta**: devolver só o necessário (o resultado volta para o contexto e custa tokens).
5. **Filial**: no modo usuário, dados com `bpl_id` respeitam `user_profiles.filiais_permitidas` de quem clicou; no modo robô, só as filiais definidas para o robô.
6. **Cérebro de outro agente**: ferramentas de memória/documentos só leem o que é do `ctx.agente`. Compartilhar entre agentes é decisão pontual explícita do dono do projeto; a ferramenta não deve contornar isso.
7. **SAP**: via o bridge `https://tableros.ngrok.app` (header `ngrok-skip-browser-warning: true`), como `faturar-sap`/`consultar-nfe`. Antes de montar payload de escrita para um documento novo, conferir o `$metadata` (ver DESAFIOS.md). Consultas independentes ao SAP podem rodar em paralelo.
8. **Nunca lançar erro com dados sensíveis na mensagem**: o texto do erro volta para o modelo e vai para o histórico.

## Organização prevista

- Ferramentas genéricas (usadas por vários agentes) ficam direto nesta pasta.
- Se uma ferramenta for específica de um agente, prefixar o arquivo com o nome dele. Só vale criar subpastas por agente se o volume justificar.
- Um `index.ts` (futuro) será o registro: mapa `nome → ferramenta`, e a função que filtra as ferramentas liberadas para o agente conforme o `soul.md`.
