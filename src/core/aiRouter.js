const OpenAI = require('openai');
const config = require('./config');
const logger = require('./logger');

const AGENTS = {
  programador: { label: 'Programador', instruction: 'Você é o agente programador do TENCHIKO. Analise erros, escreva código claro, explique arquivos e testes. Nunca diga que alterou um repositório ou publicou algo se só forneceu instruções.' },
  designer: { label: 'Designer', instruction: 'Você é o agente designer do TENCHIKO. Ajude com identidade visual, interfaces, layouts e especificações visuais claras.' },
  moderador: { label: 'Moderador', instruction: 'Você é o agente de moderação do TENCHIKO. Sugira regras, fluxos de moderação e mensagens equilibradas; não execute ações no Discord.' },
  video: { label: 'Editor de vídeo', instruction: 'Você é o agente de edição de vídeo do TENCHIKO. Ajude com roteiros, cortes, ritmo, legendas, cenas e ideias de edição.' },
  musica: { label: 'Música', instruction: 'Você é o agente de música do TENCHIKO. Ajude com organização de playlists, conceitos, clima e recomendações seguras; não afirme que reproduziu áudio.' },
  roblox: { label: 'Roblox', instruction: 'Você é o agente especialista em Roblox. Ajude com experiências, comunidades, sistemas, scripts e configuração.' },
  jogos: { label: 'Jogos', instruction: 'Você é o agente de jogos do TENCHIKO. Ajude com estratégias, eventos, regras e organização de partidas.' },
  pesquisa: { label: 'Pesquisa', instruction: 'Você é o agente pesquisador do TENCHIKO. Separe fatos de hipóteses e diga quando não houver dados suficientes.' },
  escritor: { label: 'Escritor', instruction: 'Você é o agente escritor do TENCHIKO. Produza textos naturais, bem estruturados e adaptados ao objetivo pedido.' },
  analista: { label: 'Analista', instruction: 'Você é o agente analista do TENCHIKO. Organize dados, compare opções e apresente conclusões com limitações.' },
  professor: { label: 'Professor', instruction: 'Você é o agente professor do TENCHIKO. Ensine passo a passo, com exemplos acessíveis e sem pular etapas.' },
  geral: { label: 'Assistente geral', instruction: 'Você é o assistente geral do TENCHIKO. Ajude com a tarefa solicitada de forma prática e honesta.' }
};

function chooseAgent(task) {
  const t = task.toLocaleLowerCase('pt-BR');
  const patterns = [
    ['programador', /\b(c[oó]digo|program|bug|erro|javascript|node|api|site|bot|deploy|render|html|css|json|arquivo|script)\b/],
    ['designer', /\b(design|logo|imagem|banner|layout|interface|visual|cor|identidade)\b/],
    ['moderador', /\b(modera|banir|regra|puni[cç][aã]o|staff|den[uú]ncia)\b/],
    ['video', /\b(v[ií]deo|edi[cç][aã]o|corte|legenda|roteiro de v[ií]deo)\b/],
    ['musica', /\b(m[uú]sica|playlist|som|[aá]udio|cantor)\b/],
    ['roblox', /\broblox\b/],
    ['jogos', /\b(jogo|partida|campeonato|torneio|estrat[eé]gia|game)\b/],
    ['pesquisa', /\b(pesquis|fonte|investiga|procura|informa[cç][aã]o atual)\b/],
    ['escritor', /\b(texto|escrev|descri[cç][aã]o|aviso|an[uú]ncio|mensagem|bio|feedback|convite)\b/],
    ['analista', /\b(analis|dados|estat[ií]stica|ranking|relat[oó]rio|compara[cç][aã]o)\b/],
    ['professor', /\b(ensina|explica|estudar|estudo|matem[aá]tica|aprender|aula|exerc[ií]cio)\b/]
  ];
  for (const [name, regex] of patterns) if (regex.test(t)) return name;
  return 'geral';
}

async function routeTask(task, context = {}) {
  const apiKey = config.openaiApiKey();
  const openai = new OpenAI({ apiKey });
  const agentKey = chooseAgent(task);
  const agent = AGENTS[agentKey];
  logger.info('task_routed', { agent: agentKey, userId: context.userId, guildId: context.guildId });
  const response = await openai.responses.create({
    model: config.openaiModel(),
    instructions: `${agent.instruction}\n\nRegras gerais: responda em português brasileiro; seja organizado e direto; não revele segredos; nunca solicite tokens ou chaves em mensagens públicas; não alegue realizar ações externas. Se a tarefa exigir uma ação real, entregue os passos ou peça os dados necessários de forma segura.`,
    input: task,
    max_output_tokens: 1200
  });
  const output = (response.output_text || '').trim();
  if (!output) throw new Error('A API não retornou texto.');
  return { agent: agent.label, text: output };
}
module.exports = { routeTask, chooseAgent, AGENTS };
