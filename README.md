# Pacote organizado: QG NVB + TENCHIKO

Este pacote separa os dois projetos para evitar misturar o site existente com o bot novo.

- `QG-NVB/QG-NVB-SITE-ORIGINAL.zip`: cópia intacta do ZIP do site QG NVB recebido nesta conversa.
- `TENCHIKO/`: projeto independente do bot, organizado para Node.js/discord.js e hospedagem como Background Worker no Render.

## Ordem recomendada
1. Extraia este pacote.
2. Mantenha o QG NVB na configuração de site que já usa; não publique o ZIP do site como bot.
3. Publique a pasta `TENCHIKO` em um repositório separado ou configure o Render para usar essa pasta como Root Directory.
4. Cadastre as variáveis secretas no Render e registre os comandos com `npm run deploy:commands`.

Nenhum token, segredo ou chave de API está incluído neste pacote.
