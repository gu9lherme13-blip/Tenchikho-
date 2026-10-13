# Tenchiko Bloodline — versão com painel premium

Este pacote mantém o bot Discord e o site do painel no mesmo projeto. O visual foi ajustado para preto, roxo e prata, com foco em leitura no celular e computador.

## Não apague estes arquivos
- `index.js`: inicia o bot e o servidor web.
- `index.html`: página principal do painel.
- `nvb-painel.js` e `nvb-painel.css`: lógica visual e estilos do painel. O prefixo `nvb` é um nome histórico interno; o painel é do Tenchiko Bloodline e permanece separado do QG NVB.

## O que foi alterado
- Identidade do site e textos de apresentação focados no Tenchiko Bloodline.
- Tema premium preto/roxo/prata, estados de foco, cartões e ajustes responsivos.
- Mantidas as rotas, funções e os arquivos do projeto original; não foram inventadas integrações novas.
- Mantido `index.html` porque ele é necessário para abrir o site.

## Publicação
Consulte `docs/DEPLOY-RENDER.md`. Configure os segredos apenas nas variáveis de ambiente do Render; não publique `.env` ou tokens. Se o bot já está em produção, faça backup dos dados persistentes antes de substituir arquivos.

## Testes
Execute `npm test` com Node 20 ou compatível. Os testes locais não substituem a validação com credenciais reais do Discord e no Render.
