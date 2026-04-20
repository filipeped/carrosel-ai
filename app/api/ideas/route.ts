import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";
import { getBrandVoiceReferences } from "@/lib/brand-voice";
import { brandBlockCompact } from "@/lib/brand-context";

export const runtime = "nodejs";
// Vercel Pro: 60s suficiente. 2 calls Claude em serie (gerar 16 + curar 8)
// podem levar 20-40s cada com prompt grande. Antes era 45s e estourava em 504.
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Persona — alinhada com brand-context (70% em obra / 30% casa pronta)
// ---------------------------------------------------------------------------
const PERSONA = `Voce eh estrategista de conteudo do @digitalpaisagismo.

PUBLICO REAL (nao generico — MEMORIZA):
- 70% EM OBRA (casal construindo/reformando casa R$500k+). Dor: medo de errar timing, retrabalho, obra atrasar, paisagismo virar "vou ver depois" e nao ter fiacao/irrigacao prevista.
- 30% CASA PRONTA. Dor: "faz X anos que olho essa area externa e nunca resolvo". Custo da inacao.

QUEM SALVA:
- DONA DA CASA (70% feminino) 35-55, renda 30k+. Decide junto com marido.
- Arquiteto do projeto (parceiro, nao concorrente).
- Dono/engenheiro de obra tambem consome.

QUEM NAO EH PUBLICO: paisagista querendo debater tecnica. Curador de botanica. Dono de apartamento pequeno.

OBJETIVO: ideias que a DONA DA CASA salva pra mostrar ao marido OU manda pro arquiteto.`;

// ---------------------------------------------------------------------------
// Gatilhos de CURADOR (nao-comerciais) — o que viraliza de verdade
// ---------------------------------------------------------------------------
const GATILHOS_VIRAIS = `FILOSOFIA EDITORIAL: CURADOR APAIXONADO > VENDEDOR EDUCANDO CLIENTE.

Os hits reais do perfil (249, 170, 94 saves) sao todos desta linhagem.
Zero "contrate", zero "antes da obra", zero "3 decisoes que", zero "me manda no direct".

GATILHOS DE CURADOR QUE GERAM SAVE/SHARE:

1. REVELACAO (padrao que so quem ve muitos jardins percebe)
   ✅ "A maioria dos jardins alto padrao usa as mesmas 5 plantas. Nao eh coincidencia."
   ✅ "Existe uma arvore que todo jardim classico tem. E quase ninguem presta atencao nela."
   ❌ "O erro de R$40 mil que aparece depois da obra" (tom comercial/medo)

2. SENSORIAL (textura, som, luz, tempo — nao 'ter um jardim')
   ✅ "O barulho da agua na pedra basalto muda o som da casa inteira"
   ✅ "Folhagem de palmeira real desenha sombras diferentes a cada hora do dia"
   ❌ "Seu jardim reflete sua alma" (inspiracional vazio)

3. HISTORIA DA PLANTA (tempo, crescimento, transformacao)
   ✅ "Essa arvore leva 8 anos pra ficar assim. Mas o primeiro ano decide tudo."
   ✅ "Algumas palmeiras so mostram pra que vieram depois do 3o verao"
   ❌ "Plantas para area externa" (generico)

4. OBSERVACAO DE QUEM ENTENDE (olhar tecnico traduzido em detalhe visivel)
   ✅ "O detalhe que quem entende de jardim olha primeiro"
   ✅ "Jardim fotografico e jardim que se vive nao sao a mesma coisa"
   ❌ "A pergunta que voce devia fazer ao arquiteto" (comercial disfarcado)

5. COMPORTAMENTO DO JARDIM (como ele age no tempo)
   ✅ "Jardim bom nao eh no primeiro mes. Eh no segundo verao."
   ✅ "Cada jardim tem uma estacao em que ele se mostra por inteiro"
   ❌ "3 decisoes antes de chamar o paisagista" (vendedor)

6. QUEBRA DE EXPECTATIVA (afirmacao curta que contraria intuicao)
   ✅ "Piscina nao eh o destaque da area externa. Eh o que fica em volta."
   ✅ "A cor mais importante de um jardim nao eh verde."
   ❌ "Contratar paisagista depois da obra custa 3x mais" (venda disfarcada de contrarian)`;

// ---------------------------------------------------------------------------
// Anti-padrão: o que NAO fazer (a reclamacao do user foi exatamente isso)
// ---------------------------------------------------------------------------
const ANTI_INSPIRACIONAL = `2 DIAGNOSTICOS a evitar:

A) INSPIRACIONAL VAZIO — frase bonitinha sem carne, zero save.
  "Chegar em casa e sentir o jardim abracando voce"
  "Seu jardim eh o reflexo da sua alma"
  "Transforme sua area externa num refugio"
  "A natureza cura"

B) COMERCIAL DISFARCADO — parece anuncio, algoritmo rebaixa, share=0.
  "Contratar paisagista depois da obra eh retrabalho"
  "3 decisoes antes de contratar paisagista"
  "A pergunta que voce devia fazer ao arquiteto"
  "O erro de R$40 mil que aparece depois da obra"
  "Antes do gesso fechar, o projeto ja precisa existir"
  "Me manda no direct"
  "40% do orcamento"

AMBOS reprovam. Se a ideia eh de REVELACAO, SENSORIAL, HISTORIA de planta, OBSERVACAO
de curador ou COMPORTAMENTO do jardim, aprova. Se eh pitch disfarcado ou poesia oca, reprova.

REGRA 1: se a pessoa nao consegue explicar a ideia pro conjuge em 5 segundos, a ideia nao serve.
REGRA 2: se a ideia parece "eu vendo paisagismo", a ideia nao serve. Tem que parecer "eu amo jardim e quero te mostrar algo que voce nao reparou".
REGRA 3: evite linguagem de OBRA (gesso, alvenaria, pedreiro, retrabalho). Nao eh errado, mas vira vibe de consultor, nao de curador.`;

// ---------------------------------------------------------------------------
// Formulas viralizaveis — misturando emocional + gatilho forte
// ---------------------------------------------------------------------------
const FORMULAS = `10 FORMULAS VIRAIS — use variado, nao repete a mesma:

1. ERRO ESPECIFICO + CUSTO
   "O erro de [R$X mil / Y meses] que aparece [quando]"
   Ex: "O erro de R$20 mil que aparece 1 ano depois da obra"

2. CONTRARIAN FORTE
   "[A maioria faz X]. [Consequencia ruim]."
   Ex: "Contratar paisagista depois da obra eh retrabalho com nome bonito."

3. PERGUNTA QUE O PUBLICO NAO FAZ
   "A pergunta que voce devia fazer antes de [acao]"
   Ex: "A pergunta que voce devia fazer ao arquiteto antes de fechar o projeto."

4. NUMERO + DECISAO ALTA ALAVANCA
   "N decisoes que [impacto alto em reais/tempo]"
   Ex: "3 decisoes que valem mais que escolher plantas — e duram 20 anos"

5. TIMING DA OBRA (em obra especifico)
   "Se a obra esta em [fase], [acao imediata relevante]"
   Ex: "Se a obra esta na alvenaria, a irrigacao ja precisa estar projetada."

6. CONSEQUENCIA ESCONDIDA
   "O que [coisa bonita] esconde em [tempo]"
   Ex: "O que um jardim mal planejado esconde no 2o verao."

7. QUEBRA DE EXPECTATIVA
   "[X] nao eh o que voce pensa. Eh [Y]."
   Ex: "Piscina nao eh destaque. Eh o que ta em volta."

8. CUSTO DA INACAO (casa pronta)
   "[Tempo longo] olhando [area sem uso]. [Consequencia]."
   Ex: "5 anos olhando aquela area externa sem usar — o custo nao eh dinheiro, eh familia."

9. ETAPA ESCONDIDA DE PROCESSO
   "O passo que [quem decide] pula — e paga caro"
   Ex: "O passo que o casal pula antes da obra — e custa o dobro pra corrigir."

10. PRIZE FRAME + CURADORIA
    "Nem todo projeto vira cliente. [Criterio]."
    Ex: "Projeto 3D nao eh pra todo mundo. Eh pra quem ja decidiu investir alto padrao."

OBS: formula 5, 9 e 1 funcionam MELHOR pra em obra (70% do publico). Use pelo menos 5 das 16 ideias com angle em obra.`;

// ---------------------------------------------------------------------------
// System: gerar 12 ideias virais JA CURADAS
// ---------------------------------------------------------------------------
function buildGenerateSystem(voiceRefs: string): string {
  // Prompt compacto — antes era 5k tokens (PERSONA + GATILHOS + ANTI + FORMULAS + voiceRefs)
  // e estourava timeout. Agora injetamos so o essencial.
  return `${brandBlockCompact()}

${PERSONA}

${GATILHOS_VIRAIS}

${ANTI_INSPIRACIONAL}

${voiceRefs ? `EXEMPLOS DO PERFIL (tom):\n${voiceRefs.slice(0, 1200)}\n\n` : ""}

TAREFA: gerar 12 ideias VIRAIS (JA CURADAS — so as melhores, nao 16). Cada uma em contexto diferente.

REGRAS DURAS:
- Distribuicao por GATILHO: 3+ revelacao, 2+ sensorial, 2+ historia_da_planta, 2+ observacao, resto mix.
- Titulo fala pra QUEM OLHA jardim (dona, marido, arquiteto), nao pra quem vai CONTRATAR.
- Entre 8 e 14 palavras.
- Linguagem concreta, nao poesia: planta, arvore, folha, luz, sombra, tempo, estacao, detalhe, ritmo.
- Pode citar contextos: entrada, fachada, area externa (nao "quintal"), varanda, piscina, area gourmet, rooftop, casa de campo, casa de praia, pergolado, deck, jardim de inverno.
- PROIBIDO:
  (a) Frases vazias: "acolhe", "abraca", "floresce", "reflete a alma"
  (b) Tom comercial: "contratar", "antes de chamar", "antes da obra", "3 decisoes antes", "projeto 3D", "retrabalho", "o erro de R$", "custa 3x", "me manda no direct", "em que fase"
  (c) Clickbait: "incrivel", "impressionante", "top", "dicas", "confira"
  (d) Emoji, hashtag no titulo
- Numero em lista so 3, 4 ou 5 — E sempre sobre PLANTAS/ELEMENTOS, nao sobre decisoes comerciais.

RETORNE JSON PURO:
{
  "candidatas": [
    {
      "titulo": string,
      "formula": "revelacao|sensorial|historia-planta|observacao|comportamento|quebra-expectativa",
      "contexto": string,
      "gatilho_principal": "revelacao|sensorial|historia|observacao|comportamento|quebra",
      "gancho": string (por que alguem apaixonado por jardim salva essa — nao generico)
    }
  ]
}
Exatamente 12. Gatilhos variados (3+ revelacao, 2+ sensorial, 2+ historia, 2+ observacao).`;
}

// ---------------------------------------------------------------------------
// System: curadoria 16 -> 8
// ---------------------------------------------------------------------------
const CURATE_SYSTEM = `Voce eh editor-chefe do @digitalpaisagismo. Recebeu 16 candidatas.

Selecione 8 priorizando VIRALIDADE (nao inspiracional).

ELIMINE primeiro:
1. Qualquer ideia que parece "frase de efeito" sem carne (promessa vaga de beleza, poesia emocional vazia).
2. Qualquer uma que funcionaria igual pra outra marca de paisagismo (nao tem cara Digital Paisagismo).
3. Linguagem tecnica pesada (fitossociologia, estratificacao, nomes cientificos, nomes de paisagistas famosos).
4. Contextos repetidos (max 1 em cada: piscina, varanda, entrada, rooftop).
5. Formulas repetidas (max 2 da mesma formula).

PRIORIZE:
- Information gap forte (gancho de curiosidade real)
- Loss aversion com numero/custo concreto
- Contrarian (gera comments/debate)
- Angle de "em obra" (70% do publico)

DISTRIBUICAO FINAL (nas 8):
- 4-5 com persona "em-obra" ou "ambos" com timing de obra
- 2-3 casa pronta / ambos
- Pelo menos 2 contrarian ou information-gap forte
- Maximo 1 inspiracional pura

Retorne JSON puro:
{
  "ideias": [
    { "titulo": string, "hook": string, "persona": string, "gatilho": string }
  ]
}
Exatamente 8, ordenado da mais viral pra menos viral.`;

export async function POST(req: NextRequest) {
  try {
    const { nicho, exclude, seed } = await req.json().catch(() => ({}));
    const excludeList: string[] = Array.isArray(exclude) ? exclude.slice(0, 30) : [];
    const excludeBlock = excludeList.length
      ? `\n\nNAO REPETIR ideias similares a essas (ja foram geradas recentemente):\n${excludeList.map((t) => `- ${t}`).join("\n")}\nSugira angulos e temas DIFERENTES.`
      : "";

    // Busca referencias reais do perfil (top-20 posts)
    const voiceRefs = await getBrandVoiceReferences().catch(() => "");

    // ETAPA UNICA: gera 12 candidatas JA CURADAS (antes era 16+8 em 2 calls, estourava 504)
    const gen = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 2800,
      messages: [
        { role: "system", content: buildGenerateSystem(voiceRefs) },
        {
          role: "user",
          content:
            (nicho
              ? `Interesse: "${nicho}". So 1-2 das 12 podem tocar nisso; resto explora outros contextos. JSON puro.`
              : "12 ideias VIRAIS (NAO 16), JA CURADAS — retorna so as melhores. Distribuicao: 5+ em-obra / 3+ casa-pronta / resto ambos. JSON puro.") +
            excludeBlock +
            (seed ? `\n\n[rng=${seed}]` : ""),
        },
      ],
    });
    const genRaw = gen.choices[0]?.message?.content || "";
    let candidatas: any[] = [];
    try {
      const parsed: any = extractJson(genRaw);
      candidatas = Array.isArray(parsed) ? parsed : parsed.candidatas || [];
    } catch {
      return NextResponse.json({ error: "IA JSON invalido", raw: genRaw.slice(0, 300) }, { status: 500 });
    }
    if (candidatas.length < 4) {
      return NextResponse.json({ error: `Apenas ${candidatas.length} candidatas`, candidatas }, { status: 500 });
    }

    // Curadoria DETERMINISTICA — prioriza gatilhos de CURADOR (revelacao, sensorial,
    // historia, observacao). Penaliza tom comercial e inspiracional vazio no titulo.
    const COMMERCIAL_TERMS = [
      "contratar", "antes de chamar", "antes da obra", "antes do pedreiro", "antes do gesso",
      "antes do arquiteto", "3 decis", "4 decis", "5 decis", "projeto 3d",
      "retrabalho", "r$", "custa 3x", "custa o dobro", "me manda", "no direct",
      "em que fase", "a pergunta que voce devia",
    ];
    const INSPIRATIONAL_TERMS = [
      "abrac", "floresce", "acolhe", "reflete", "respira natureza", "envolve em",
    ];
    const scoreHeuristic = (c: any): number => {
      let s = 0;
      const gat = String(c.gatilho_principal || "").toLowerCase();
      if (gat.includes("revelac")) s += 4;
      if (gat.includes("sensorial")) s += 3;
      if (gat.includes("historia")) s += 3;
      if (gat.includes("observac")) s += 3;
      if (gat.includes("comportamento")) s += 2;
      if (gat.includes("quebra")) s += 2;
      const titulo = String(c.titulo || "").toLowerCase();
      for (const t of COMMERCIAL_TERMS) if (titulo.includes(t)) s -= 5;
      for (const t of INSPIRATIONAL_TERMS) if (titulo.includes(t)) s -= 4;
      return s;
    };
    const sorted = [...candidatas].sort((a, b) => scoreHeuristic(b) - scoreHeuristic(a));
    const seenContexts = new Map<string, number>();
    const seenFormulas = new Map<string, number>();
    const top: any[] = [];
    for (const c of sorted) {
      if (top.length >= 8) break;
      const ctx = String(c.contexto || "").toLowerCase();
      const f = String(c.formula || "").toLowerCase();
      if ((seenContexts.get(ctx) || 0) >= 2) continue;
      if ((seenFormulas.get(f) || 0) >= 2) continue;
      seenContexts.set(ctx, (seenContexts.get(ctx) || 0) + 1);
      seenFormulas.set(f, (seenFormulas.get(f) || 0) + 1);
      top.push(c);
    }
    const ideias = {
      ideias: top.map((c) => ({
        titulo: c.titulo,
        hook: c.gancho || "",
        gatilho: c.gatilho_principal,
      })),
    };
    return NextResponse.json(ideias);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
