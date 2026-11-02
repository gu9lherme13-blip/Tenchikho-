# B2 — Mapeamento dos dados e procedimento de migração

> Estado: **proposta**. Nenhuma migração de produção foi executada. O bot continua lendo/gravando o formato antigo
> (arquivos `.json` na raiz de `DATA_DIR`), agora pela camada segura `storage.js`.

## 1. Como cada arquivo é usado hoje (confirmado no código)

| Arquivo | Formato antigo | Quem altera | Tem servidor nos registros? |
|---|---|---|---|
| `pontos.json` / `xp.json` | `{ userId: número }` | `addPoints`/`removePoints` (index.js), `/pontos`, `/recompensa`, XP por mensagem | **Não** |
| `conquistas.json` | `{ userId: [ {nome, por, at} \| "texto" ] }` | `/conquista-add` | **Não** |
| `recompensas.json` | `[ {userId, nome, pontos, por, at} ]` | `/recompensa` | **Não** |
| `historico.json` | `{ userId: [ {action, details, at} ] }` | `modHistory` (moderação) | **Não** |
| `logs.json` | `[ {type, userId, details, at} ]` (máx. 1000) | `logAction` | **Não** |
| `config.json` | `{ roleIds: {CHAVE: roleId}, ... }` | `/config-cargo` (hoje removido) | **Não** (IDs de cargo são de um servidor) |
| `presenca.json`, `presencaHistorico.json` | objeto / lista | leitura em index.js (sem gravação no código atual) | **Não** (histórico tem `callId`) |
| `chamadas.json` | `{ guildId: chamada }` | `/chamada`, encerramento à meia-noite | **Sim** (chave) |
| `boasvindas.json` | `{ guildId: config }` | painel (rota de boas-vindas) | **Sim** (chave) |
| `tickets_cfg.json` | `{ guildId: config }` | painel (tickets) | **Sim** (chave) |
| `tickets_abertos.json` | `{ channelId: {guildId, userId, criadoEm} }` | painel/botões de ticket | **Sim** (campo) |
| `autorole_panels.json` | `{ panelId: {guildId, ...} }` | painel (auto cargos) | **Sim** (campo) |
| `resenhas.json`, `jogatinas.json` | `[ itens ]` | `/resenha`, `/jogatina` | **Não** |
| `interacoes.json` | `{ userId: { acao: contagem } }` | comandos de interação (anime) | **Não** |
| `roblox.json` | `{ userId: {username, ...} }` | `/roblox-vincular` (hoje removido) e leitura em `getMemberRoblox` | Não — é vínculo **de usuário** |
| `gravacoes.json` | `[ ... ]` | nada grava no código atual | Não |
| `avisos`, `codes`, `atividades`, `suportes` | vários | **ninguém usa** no código atual | — |
| `recrutamentos`, `recrutamento_links` | — | eram do QG NVB; não pertencem ao Tenchiko | — |

## 2. Estrutura nova (por servidor)

```
DATA_DIR/
  _meta/schema.json                       versão do formato, servidor principal, backup usado, contagens
  guilds/<guildId>/
      config · pontos · xp · conquistas · recompensas · historico · logs
      chamadas · presenca · presencaHistorico · resenhas · jogatinas · gravacoes · interacoes
      boasvindas · autorole_panels
      tickets.json   =  { cfg: {...}, abertos: { channelId: {...} } }
  global/roblox.json                      vínculo usuário ↔ Roblox (vale em qualquer servidor)
  _legacy/                                dados sem destino claro (preservados, nunca apagados)
  _backups/pre-migration-<data>/          cópia de TODOS os .json + MANIFEST.json (SHA-256)
  _quarantine/                            cópias de arquivos corrompidos encontrados
```

## 3. Regras de conversão (antigo → novo)

1. **Registros sem servidor** (`pontos`, `xp`, `conquistas`, `recompensas`, `historico`, `logs`, `config`, `presenca`, `resenhas`, `jogatinas`, `gravacoes`, `interacoes`):
   vão **inteiros** para `guilds/<servidor principal>/`. O servidor principal é informado pelo administrador (`--legacy-guild`).
   Premissa que **precisa ser confirmada por você**: o bot sempre operou em um único servidor (o código usa `qgGuild()` / `GUILD_ID`).
   Se o bot esteve em vários servidores, esses dados já estão misturados e **não há como separá-los retroativamente**.
2. **Já com servidor** (`chamadas`, `boasvindas`, `tickets_cfg`, `tickets_abertos`, `autorole_panels`): divididos por servidor.
   Chave/campo inválido (não numérico, ausente) → `_legacy/<arquivo>.rejeitados.json` (nada é descartado).
3. **`presencaHistorico`**: cada registro vai para o servidor cuja chamada tenha o mesmo `callId`; os demais, para o servidor principal.
4. **`roblox`** → `global/roblox.json` (vínculo é do usuário, não do servidor).
5. **Sem uso / do QG** (`avisos`, `codes`, `atividades`, `suportes`, `recrutamentos`, `recrutamento_links`): copiados para `_legacy/` se tiverem conteúdo.
6. **Arquivos antigos nunca são alterados nem apagados.** `config.json` mantém todas as chaves, inclusive `recrutChannelId` (obsoleta; será removida só na B4, com aprovação).
7. Permissões por servidor: `config.roleIds` passa a ser a fonte por servidor; hoje o bot ainda usa `ROLE_*` do ambiente como padrão (troca na B4).

## 4. Procedimento (ferramenta `tools/migrate-to-guilds.js`)

1. **Parar o bot** e **guardar uma cópia dos `.json` de produção fora do Render** (a ferramenta também faz um backup interno, mas ele fica no mesmo disco).
2. `plan --dir <DATA_DIR> --legacy-guild <ID>`: só lê; valida todos os arquivos, mostra destinos/contagens e avisos.
3. `apply ... --confirm-offline-backup`: valida → backup com SHA-256 → monta tudo em `_staging-*` → confere conteúdo e contagens → move as pastas → grava `_meta/schema.json` **por último**.
   Qualquer falha antes do marcador desfaz o que foi movido; os arquivos antigos seguem intactos. Recusa origem toda vazia e recusa rodar duas vezes.
4. `verify`: compara o formato novo com os arquivos antigos (divergência é esperada se algo gravou depois).
5. `rollback [--restore-flat]`: move o formato novo para `_rolled_back-*/` (sem apagar). Com `--restore-flat`, restaura os `.json` antigos do backup e guarda os atuais ao lado.

> Limite conhecido: depois que o **bot** passar a gravar no formato novo (B4), um rollback devolve os arquivos antigos **sem** o que foi gravado depois.
> Por isso a troca de formato na B4 será feita com janela de manutenção e validação antes de liberar o uso.

## 5. O que a B2 NÃO faz
- Não migra dados reais; não troca o formato que o bot usa (continua nos arquivos antigos).
- Não faz o bot operar em vários servidores: a lógica atual (`qgGuild()`, `callsChannelId` fixo, `ROLE_*`) é de um servidor só. Isso é B4/B5.
