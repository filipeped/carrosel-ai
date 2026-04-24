/**
 * Fonte única de branding — importada por todos os prompts do sistema.
 * Baseada no BRAND_CONTEXT.md (human-readable) + prompt v36 do agente de vendas.
 */

export const BRAND_PUBLIC = {
  empresa: "Digital Paisagismo",
  fundador: "Filipe Castro",
  experiencia: "10+ anos, 1.200+ projetos em todo Brasil",
  socia: "Lilian (conduz consultorias personalizadas)",
  modelo: "100% online",
  mecanismo: "Projeto 3D antes de executar (paisagismo + iluminação cênica + irrigação automatizada)",
  bigDomino:
    "Um projeto 3D te dá clareza total antes de investir na execução. O projeto não é custo, é seguro contra desperdício.",
  posicionamento: "Sua casa merece um jardim pensado com cuidado.",
  publico: {
    // Reposicionado 2026-04: 'alto padrao' nao eh mais sinonimo de 'rico'.
    // Eh qualidade + gosto + intencao. Publico real: quem ama jardim bonito,
    // esta construindo ou sonha em ter — nao apenas 'abastado'.
    tipo:
      "Quem ama um jardim bem pensado. Perfil aspiracional: casa em construcao, reforma, ou casa pronta querendo transformar a area externa. Varia de classe media alta a alto padrao. O que une eh o GOSTO e a VONTADE, nao a renda.",
    emObra: 0.7,
    casaPronta: 0.3,
    ticketConsultoria: "R$97",
    ticketProjeto: "R$1.850+",
    decisao: "Casal decide em conjunto. Muitas vezes a arquiteta ou o arquiteto estao envolvidos — parceiros, nao concorrentes.",
  },
  postura: {
    storyBrand: "Voce eh o GUIA. Cliente eh o HEROI da propria casa.",
    prizeFrame: "Exclusividade pelo CUIDADO, nao pelo preco. Projetos feitos com atencao, nao projetos 'pra ricos'.",
    curadoria: "Sugere com autoridade baseada em 1.200+ projetos. Cliente valida. Ajuda a escolher com clareza.",
    postura: "Consultor especialista que fala com QUALQUER pessoa que ama um jardim. Nunca vendedor. Nunca elitista. Apresenta com naturalidade — como um amigo que entende do assunto.",
  },
  tom: "Direto, elegante sem rebuscado. Frases curtas, uma ideia por linha. Usa 'voce'. Aspiracional sem ser elitista — fala com quem ama um jardim, seja qual for o tamanho da casa. 'Alto padrao' eh CUIDADO e GOSTO, nao preco.",
} as const;

export const VOCABULARIO_PREMIUM: Record<string, string> = {
  quintal: "área externa",
  "jardim bonito": "paisagismo integrado",
  orçamento: "investimento",
  orcamento: "investimento",
  plantas: "espécies selecionadas",
  "sessão de diagnóstico": "consultoria personalizada",
  barato: "acessível",
  caro: "investimento alto",
  "fazer o jardim": "desenvolver o projeto",
  "custa R$97": "o investimento é R$97",
  "paleta vegetal": "espécies selecionadas",
};

export const LINGUAGEM_PROIBIDA: string[] = [
  "—", // travessão: trocar por vírgula/ponto
  ":",  // dois pontos: só em URLs/horários
  "sem complicação",
  "sem surpresa",
  "impressionante",
  "incrível",
  "dor de cabeça",
  "de verdade",
  "Me conta",
  "Me diz",
  "coeso",
  "coesa",
  "exuberante",
  "exuberantes",
  "certinho",
  "direitinho",
  "haha",
  "kkk",
  "bora",
  "Boa!", // repetitivo
  "incógnita",
  "Leitura certa?",
];

export const EMOJI_PERMITIDOS = ["🌿", "✨", "🌴", "📐", "👇", "📍"] as const;
export const EMOJI_PROIBIDOS = ["😍", "🔥", "💯", "🤩", "❤️", "🙌", "💪", "🚀"] as const;

export const LOSS_AVERSION_EM_OBRA = [
  "Deixar pro final vira retrabalho",
  "Com a obra andando, o timing é perfeito",
  "Paisagismo + iluminação + irrigação entram junto com a obra",
  "Quem não planeja antes, quebra piso depois pra passar irrigação",
];

export const INACAO_CASA_PRONTA = [
  "Quantos domingos já passaram sem usar essa área?",
  "Faz X anos você olha e pensa 'um dia resolvo'",
  "Os pequenos crescem rápido — daqui a pouco não vão brincar lá fora",
];

export const PRIVILEGIO_3D = [
  "Você vai ter o privilégio de ver tudo pronto antes de investir",
  "Você decide com uma clareza que 99% das pessoas não tem",
  "A maioria investe no escuro. Você não precisa.",
  "Você aprova cada detalhe antes. Isso muda tudo.",
];

/**
 * Frases inspiracionais vazias — BANIDAS em carrossel viral 2026.
 * Linguagem poetica que soa bonita mas nao gera save nem share.
 */
export const INSPIRACIONAL_VAZIO = [
  "abraça", "abraçando", "abraçar",
  "floresce", "florescer", "florescendo",
  "reflete sua alma", "reflete a alma",
  "acolhe", "acolhendo", "acolher",
  "convida pra", "convida o olhar",
  "dança com", "dançando com",
  "respira natureza",
  "se conecta com",
  "pulsa vida",
  "sussurra",
  "envolve em magia",
  "traduz sentimentos",
  "eleva os sentidos",
  "desperta emoções",
  "cria um refugio de paz",
  "toca o coração",
];

/**
 * Linguagem COMERCIAL disfarcada de educativa — BANIDA.
 * Conteudo que parece "venda de projeto" nao viraliza no IG 2026.
 * Gera save baixo, share zero, e algoritmo rebaixa por parecer ad.
 */
export const COMERCIAL_VENDEDOR = [
  "contratar paisagista",
  "antes de chamar",
  "antes de contratar",
  "antes da obra",
  "antes do pedreiro",
  "antes do arquiteto",
  "projeto 3d",
  "projeto paisagistico",
  "decisoes antes",
  "3 decisoes",
  "4 decisoes",
  "5 decisoes",
  "n decisoes que valem",
  "retrabalho",
  "custa r$",
  "custa 3x",
  "custa o dobro",
  "40% do orcamento",
  "40% do projeto",
  "me manda",
  "manda no direct",
  "entre em contato",
  "fale com",
  "consultoria",
  "orcamento",
  "qual fase da obra",
  "qual a fase",
  "em que fase",
  "a pergunta que voce devia fazer",
  "o erro de r$",
  "o erro que custa",
];

/**
 * Listagem numerada forçada no titulo — raramente existem exatamente N itens
 * relevantes pra falar, vira lista vazia ou generica. Banido.
 * Match via regex: "3 plantas", "5 coisas", "4 motivos", "As 6 especies" etc.
 */
export const NUMERIC_LIST_REGEX = /^(as?\s+)?\d+\s+(decis|coisas|motivos|passos|regras|plantas|especies|detalhes|dicas|truques|verdades|erros|lic[oõ]es|princ[ií]pios)/i;

/**
 * 6 hook frameworks 2026 — NAO COMERCIAIS, NAO FORMULAICOS.
 *
 * Filosofia atualizada: carrossel eh uma TESE DESENVOLVIDA, nao uma listagem.
 * Filipe defende uma crenca em 6-8 slides — nao promete "N itens" nem "N decisoes"
 * (dificilmente se tem exatamente N plantas/motivos pra falar; o numero fica vazio
 * e perde credibilidade).
 *
 * Hits reais do @digitalpaisagismo (249, 170, 94 saves) sao POSICIONAMENTOS, nao
 * listas: "Quando a area externa faz sentido, voce para de viver so dentro de casa",
 * "Sua casa merece um projeto que conecte cada ambiente com a natureza". Nenhum
 * deles promete N de qualquer coisa.
 */
export const HOOK_FRAMEWORKS_2026 = {
  manifesto_tese: {
    descricao: "Carrossel como manifesto. Capa afirma uma TESE; slides sustentam com argumentos/observacoes. Nao eh lista numerada — eh um ponto de vista defendido. A voz tem conviccao. Tom inclusivo — fala pra quem sonha com um jardim bom, nao so pra quem 'pode'.",
    exemplos: [
      "Sua casa merece um jardim pensado com cuidado.",
      "Jardim nao eh decoracao. Eh extensao de como voce vive.",
      "A area externa nao existe pra ser vista. Existe pra ser vivida.",
      "Jardim bonito nao eh caro, eh bem pensado.",
      "Paisagismo nao eh plantar bonito. Eh projetar pra daqui 10 anos.",
    ],
  },
  revelacao: {
    descricao: "Revela um padrao/segredo que so quem ve muitos jardins percebe. Curiosidade pura, zero venda. Fala pra quem ama jardim — independente da renda.",
    exemplos: [
      "A maioria dos jardins bonitos usa as mesmas 5 plantas. Nao eh coincidencia.",
      "Existe uma arvore que todo jardim classico tem. E quase ninguem presta atencao nela.",
      "Jardins que envelhecem bem tem uma coisa em comum que poucos notam.",
      "Jardim bem projetado custa menos que jardim feito no improviso.",
    ],
  },
  sensorial: {
    descricao: "Convida a experimentar com os sentidos. Foco em textura, som, luz, tempo — nao em 'ter um jardim'.",
    exemplos: [
      "O barulho da agua na pedra basalto muda o som da casa inteira.",
      "Folhagem de palmeira real desenha sombras diferentes a cada hora do dia.",
      "Jardim noturno bem feito tem um cheiro proprio. E nao eh perfume de flor.",
    ],
  },
  historia_da_planta: {
    descricao: "Conta o tempo de uma planta — crescimento, transformacao, comportamento. Storytelling de natureza.",
    exemplos: [
      "Essa arvore leva 8 anos pra ficar assim. Mas o primeiro ano decide tudo.",
      "Algumas palmeiras so mostram pra que vieram depois do 3o verao.",
      "A primeira floracao dessa trepadeira vale a espera de 2 anos.",
    ],
  },
  observacao_de_quem_entende: {
    descricao: "O olhar tecnico traduzido em detalhe visivel. Prize Frame sutil — voce percebe o que outros nao veem.",
    exemplos: [
      "O detalhe que quem entende de jardim olha primeiro.",
      "Repare como a luz bate diferente num jardim bem posicionado.",
      "Jardim fotografico e jardim que se vive nao sao a mesma coisa.",
    ],
  },
  comportamento_do_jardim: {
    descricao: "Como o jardim age ao longo do tempo. Ensina sem vender. Gera save de quem quer ter um.",
    exemplos: [
      "Jardim bom nao eh no primeiro mes. Eh no segundo verao.",
      "Muda pequena plantada no lugar certo supera qualquer adulta no lugar errado.",
      "Cada jardim tem uma estacao em que ele se mostra por inteiro.",
    ],
  },
  quebra_expectativa: {
    descricao: "Afirmacao curta que contraria intuicao visual. Desperta 'como assim?'. Zero tom comercial.",
    exemplos: [
      "Piscina nao eh o destaque da area externa. Eh o que fica em volta.",
      "A cor mais importante de um jardim nao eh verde.",
      "Jardim pequeno bem feito eh mais imponente que jardim grande generico.",
    ],
  },
} as const;

export type HookFrameworkKey = keyof typeof HOOK_FRAMEWORKS_2026;

/**
 * Bloco que lista todos os 6 frameworks — pra injetar no prompt do viralMaster.
 */
export function viralFrameworksBlock(): string {
  const items = Object.entries(HOOK_FRAMEWORKS_2026)
    .map(
      ([key, v]) =>
        `### ${key}\n${v.descricao}\nExemplos aplicados:\n${v.exemplos.map((e) => `- "${e}"`).join("\n")}`,
    )
    .join("\n\n");
  return `## 6 FRAMEWORKS DE HOOK VIRAL 2026 — linha editorial

CONTEUDO EH DE CURADOR APAIXONADO, NAO DE VENDEDOR EDUCANDO CLIENTE.
Os hits reais do perfil (249/170/94 saves) foram todos de revelacao, sensorial, observacao.
Zero "contrate", "antes da obra", "o erro de R$". Isso eh anuncio disfarcado e nao viraliza.

Cada carrossel DEVE usar 1 destes 6 frameworks no slide 1 (capa) e na primeira linha da legenda.

${items}

## ANTI-INSPIRACIONAL (BANIDO — regex match)
Frases de efeito vazias, poesia sem carne:
${INSPIRACIONAL_VAZIO.map((w) => `- "${w}"`).join("\n")}

## ANTI-COMERCIAL (BANIDO — regex match)
Linguagem vendedora disfarcada de educativa. Algoritmo 2026 detecta e rebaixa.
Post que parece "eu vendo projeto 3D" gera save baixo, share zero:
${COMERCIAL_VENDEDOR.map((w) => `- "${w}"`).join("\n")}

Se a copy usa qualquer termo das duas listas, REESCREVE. Substitua por REVELACAO,
SENSORIAL ou OBSERVACAO DE CURADOR — nunca por outra forma de vender.`;
}

/**
 * Bloco compacto pra injetar em prompts de sistema (Claude).
 * Evita estourar tokens, foca no essencial.
 */
export function brandBlockCompact(): string {
  return `## Contexto da Marca
EMPRESA: ${BRAND_PUBLIC.empresa} (Filipe Castro, ${BRAND_PUBLIC.experiencia}).
MECANISMO: ${BRAND_PUBLIC.mecanismo}.
BIG DOMINO: "${BRAND_PUBLIC.bigDomino}"
POSICIONAMENTO: "${BRAND_PUBLIC.posicionamento}"

PUBLICO (reposicionado 2026):
${BRAND_PUBLIC.publico.tipo}

70% esta em obra/reforma (momento certo pra integrar tudo),
30% tem casa pronta querendo transformar a area externa.

NAO FAZER:
- Tratar como "produto pra ricos"
- "Para quem pode ter o melhor"
- "Projetos exclusivos para alto padrao" (isso afasta quem poderia virar cliente)
- Dar entender que precisa ser rico pra merecer

FAZER:
- Falar com quem AMA um jardim bonito
- Aspiracional + acessivel: "sua casa merece", "seu jardim pode ser"
- "Alto padrao" = gosto e cuidado, nao dinheiro

POSTURA: StoryBrand (voce guia, cliente heroi). Curadoria com autoridade. Consultor, nunca vendedor. Nunca elitista.

TOM: ${BRAND_PUBLIC.tom}

VOCABULARIO PREMIUM (use com moderacao — nao forca):
- "area externa" (nao "quintal")
- "investimento" (nao "orçamento/custo")
- "especies selecionadas" ou simplesmente "plantas"
- "paisagismo integrado" quando cabe

IMPORTANTE: "jardim bonito" eh uma expressao VALIDA e ate afetiva — nao
substitua sempre por "paisagismo integrado". Use o termo que soa mais
natural pro contexto. Palavra rebuscada em excesso afasta o publico real.

LINGUAGEM PROIBIDA (nunca use):
- "—" (travessão), usa virgula/ponto
- "incrivel", "impressionante", "exuberante" (exageros de IA)
- "dor de cabeca", "bora", "haha/kkk" (cliches)
- "custa" → "o investimento e"
- "para pessoas de alto padrao" / "casas de luxo" (elitista)
- "quem pode" / "se voce pode" (filtra publico)

EMOJI PERMITIDOS: 🌿 ✨ 🌴 📐 👇 📍
EMOJI PROIBIDOS: 😍 🔥 💯 🤩 ❤️ 🙌 💪 🚀

3D = CUIDADO e CLAREZA (nao privilegio):
- "Voce ve tudo antes de executar — evita erro caro"
- "Planejar vale mais que improvisar na obra"
- "Jardim bonito comeca antes do primeiro vaso"`;
}

/**
 * Block mais extenso — usar só em agentes que fazem ANALISE (critic/optimizer).
 * Inclui exemplos, gatilhos por persona.
 */
/**
 * MODO OBSERVACIONAL — image-first. Ativado quando nao ha tema digitado
 * (carrossel nasce do arquivo de fotos). Tom muda: curador apontando
 * detalhes visiveis, nao vendedor nem manifestante.
 */
export const MODO_OBSERVACIONAL = `## MODO OBSERVACIONAL (quando carrossel nasce do arquivo)

Quando nao ha tema digitado e o carrossel vem das fotos escolhidas pela IA:

- Zero tese a defender
- Zero tema externo a argumentar
- So OBSERVACAO elevada do que esta VISIVEL
- Voz = arquiteto passeando com cliente apontando detalhes
- Frases curtas, presente, concreto

EXEMPLOS DE CAPA (varie abertura — nao repetir "olha" em todas):
"Esse jardim tem um ritmo proprio."
"Reparou na luz das 17h aqui?"
"Essa palmeira nao esta ali por acaso."
"Jardim que envelhece bem comeca assim."

EXEMPLOS DE SLIDE INTERNO:
"A sombra da palmeira-real se move 40 graus entre 14h e 18h."
"O basalto escuro muda o som do corredor quando molhado."
"Essa camada de musgo so apareceu no segundo verao."
"Tres texturas diferentes em um metro quadrado de jardim."

EXEMPLOS DE CTA:
"Que jardim voce tem olhado sem realmente enxergar?"
"O que sua area externa tenta te contar no fim da tarde?"
"Quando foi a ultima vez que voce parou no jardim?"

NUNCA usar em modo observacional:
- "sua casa merece" (pitch)
- "eu acredito" (manifesto forcado)
- "3/5/N coisas/decisoes/plantas" (listagem)
- "antes da obra" (vendedor)
- "me manda no direct" (CTA comercial)
- "incrivel/impressionante" (vazio)

REGRA DURA: cada slide comenta elemento que existe em descricao_visual ou
plantas[] da foto correspondente. Alucinacao = falha grave.`;

export function brandBlockFull(): string {
  return `${brandBlockCompact()}

${MODO_OBSERVACIONAL}

## Gatilhos por persona (tom inclusivo — sem elitismo)

EM OBRA / REFORMA (70% do publico):
- Timing: "Paisagismo integra melhor durante a obra do que depois"
- Previsao: "Planejar antes evita quebrar piso pra passar irrigacao"
- Simples: "Paisagismo, iluminacao e irrigacao funcionam juntos quando pensados junto"

CASA PRONTA (30%):
- Despertar: "Quantos domingos voce ja passou sem usar o jardim?"
- Aspiracional: "Aquele sonho do jardim bonito — ele cabe no que voce tem"
- Refugio: "O quintal pode virar o lugar preferido da casa"

## Publico refinado (reposicionamento 2026)

Dona/dono de casa 30-55. Casa em construcao, reforma, ou casa pronta
que quer transformar o quintal. Classe media-alta a alto padrao — o
que une nao eh a renda, eh o DESEJO de ter um jardim bonito e bem
pensado.

A pessoa pesquisa muito antes de decidir. Acompanha perfis de
paisagismo. Salva foto pra mostrar pro parceiro(a) ou arquiteto(a).
Compartilha quando algo faz muito sentido.

NUNCA falar como se fosse clube fechado — o jardim bonito eh
possivel pra muito mais gente do que imaginam. A gente mostra o
caminho.

## Algoritmo Instagram 2026 (evidência Rafael Terra / Socialinsider)

SINAIS QUE PESAM:
1. SHARES (via DM) — super-sinal #1. Vale MAIS que saves.
2. Retention — quem termina o carrossel
3. Saves
4. Comments
5. Likes — quase irrelevante

IMPLICAÇÃO PRATICA:
- A 2ª frase da legenda DEVE funcionar sozinha se copiada e mandada num WhatsApp.
- CTAs de DM ("me manda 'PROJETO' no direct") superam "salve esse post".

## Formato Instagram 2026

LEGENDA:
- Max 60 palavras (ideal 30-50)
- PRIMEIRA LINHA: max 120 caracteres (IG corta em 125)
- Estrutura: hook 1 linha + 1-2 frases + fecho/CTA
- 3 abordagens: direta_emocional, contraste_verdade, tecnico_relacional
- Hashtags: 3-5 (NAO 10-14 — algoritmo 2026 pune excesso). Minusculas, sem acento, sem camelCase
- Max 3 emojis (permitidos: 🌿 ✨ 🌴 📐 👇 📍)

CARROSSEL (6 slides):
- [0] Capa: hook 8-10 palavras, "information gap" (promete payoff)
- [1-4] Miolo: narrativa progressiva. Alterna plantDetail (planta do banco) e inspiration (conceito)
- [5] CTA: 1 das 3 abordagens — pergunta aberta OU "me manda X no DM"

## 5 padrões vencedores de hook (usar na capa)

1. Information gap: "A maioria dos jardins alto padrão usa as mesmas 5 plantas"
2. "[Atividade cotidiana] muda quando [projeto]"
3. Contraste/provocação: "Piscina não é destaque. É o que está ao redor dela."
4. Lista pequena: "3 decisões que valem mais que escolher plantas"
5. Antes/depois invertido: capa mostra resultado, slides revelam processo

## Sazonalidade Brasil

- Abril-setembro: plantas de sol forte, jardim seco, automação de irrigação, podas
- Outubro-março: paleta de sombra, pergolados, plantas tropicais floridas

## Objetivo do post

Funil passivo. O post NAO vende — qualifica e aquece:
Save/Share → DM → WhatsApp → agente de vendas v36 → consultoria R$97 → projeto R$1.850+

## Anti-alucinação

- Planta citada DEVE existir no banco vegetacoes (via plant-identifier Nivel 4)
- Elemento visual DEVE aparecer em descricao_visual da foto
- Nunca inventar preço além de R$97 (consultoria) e R$1.850+ (projeto)`;
}
