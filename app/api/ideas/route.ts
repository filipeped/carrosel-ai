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
// Gatilhos VIRAIS 2026 (o que MOVE a pessoa a salvar/compartilhar)
// ---------------------------------------------------------------------------
const GATILHOS_VIRAIS = `GATILHOS QUE GERAM ENGAJAMENTO REAL (nao so like vazio):

1. INFORMATION GAP (curiosidade forte)
   Abre um loop que so fecha depois que a pessoa ve. Exige payoff real nos slides.
   ✅ "O erro de R$30 mil que aparece 6 meses depois da obra"
   ✅ "A pergunta que paisagista evita — e muda tudo no seu projeto"
   ❌ "Descubra como ter um jardim lindo" (vazio, generico)

2. LOSS AVERSION (medo de perder — 2x mais forte que ganho)
   Foco no que a pessoa PERDE se nao agir agora.
   ✅ "Cada mes que voce adia o paisagismo, a obra fica mais cara depois"
   ✅ "Quebrar piso pra passar irrigacao custa 3x fazer no planejamento"
   ❌ "Seu jardim pode ser lindo" (promessa vaga de ganho)

3. CONTRARIAN / QUEBRA DE CONSENSO (vai contra senso comum)
   Discorda de algo que o publico assume como verdade. Gera debate nos comments.
   ✅ "Contratar o paisagista cedo demais eh dinheiro jogado fora"
   ✅ "Piscina nao eh destaque. Eh o que ta em volta dela."
   ❌ "Natureza faz bem pra casa" (todo mundo concorda, zero engajamento)

4. NUMERO CONCRETO + DOR ESPECIFICA (nao frase poetica)
   Numero da credibilidade e especifica o custo.
   ✅ "3 decisoes que valem mais que escolher as plantas"
   ✅ "40% do orcamento vai pra dar errado se voce decidir nessa ordem"
   ❌ "Muitas coisas podem dar errado" (vago)

5. QUESTAO DE STATUS / PRIZE FRAME
   A pessoa salva porque quer se sentir no clube certo.
   ✅ "Projetos alto padrao sao seletivos — nem todo mundo vira cliente"
   ✅ "O detalhe que quem entende de paisagismo olha primeiro"
   ❌ "Venha conhecer nossos projetos" (vendedor)

6. TIMING ESPECIFICO (urgencia real, nao fake)
   Amarra no momento do publico (obra andando, fim do ano, casa de campo).
   ✅ "Se a obra esta na fase da alvenaria, esse eh o momento da irrigacao"
   ✅ "Antes do gesso fechar, o projeto paisagistico ja precisa existir"
   ❌ "Hora de plantar" (sem contexto)`;

// ---------------------------------------------------------------------------
// Anti-padrão: o que NAO fazer (a reclamacao do user foi exatamente isso)
// ---------------------------------------------------------------------------
const ANTI_INSPIRACIONAL = `DIAGNOSTICO ATUAL — muito conteudo inspiracional, pouco viral.

REPROVA automatico:

[FRASE BONITINHA SEM CARNE]
  "Chegar em casa e sentir o jardim abraçando voce" — bonito, mas quem salva isso? 0 acao.
  "Seu jardim eh o reflexo da sua alma" — pura frase de efeito.

[PROMESSA VAGA DE BELEZA]
  "Um jardim que muda tudo" — vazio.
  "Transforme sua area externa" — todo anuncio diz isso.

[POESIA EMOCIONAL GENERICA]
  "A natureza cura" / "Um refugio pra sua familia" — lindo mas nao gera salve nem share.

[AUTORIDADE VAZIA]
  "Vocabulario tecnico de fitossociologia" — so paisagista entende.
  "Isabel Duprat usa essa tecnica" — nome afasta leigo.

[TECNIQUES QUE SO PAISAGISTA ENTENDE]
  "Estratificacao vertical em entrada" — cliente nao salva.
  "Dossel de nivel 2 com especies de porte" — tecnico demais.

REGRA DURA: se a pessoa nao consegue explicar a ideia pro conjuge em 5 segundos, a ideia nao eh boa.
REGRA DURA 2: se a ideia funciona igual pra qualquer marca de paisagismo, nao serve. Tem que ter a cara Digital Paisagismo (projeto 3D, alto padrao, em obra).`;

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
- PELO MENOS 6 das 16 com angle EM OBRA (timing/retrabalho/integracao — nao da pra ignorar 70% do publico).
- PELO MENOS 3 com Loss Aversion / custo concreto / numero (nao so emocional).
- PELO MENOS 2 Contrarian (quebra consenso — gera debate).
- Maximo 3 inspiracionais puras (nao eh zero — ainda tem lugar pra emocional).
- Titulo fala pra DONA DA CASA ou PARA O CASAL (nao pro paisagista).
- Entre 8 e 14 palavras.
- Linguagem concreta, nao poesia: casa, obra, projeto, decisao, custo, timing, rotina, familia.
- Pode citar contextos: entrada, fachada, area externa (nao "quintal"), varanda, piscina, area gourmet, rooftop, casa de campo, casa de praia, pergolado, deck, corredor lateral, jardim de inverno.
- Proibido: frases de efeito vazias ("acolhe", "abraca", "floresce", "reflete a alma"), "alto padrao" explicito mais de 1x, "incrivel", "impressionante", "top", "dicas", "confira", emoji, hashtag.
- Numero em lista so 3, 4 ou 5.

RETORNE JSON PURO:
{
  "candidatas": [
    {
      "titulo": string,
      "formula": "erro-custo|contrarian|pergunta|numero-decisao|timing-obra|consequencia-escondida|quebra-expectativa|custo-inacao|etapa-escondida|prize-frame|inspiracional",
      "contexto": string,
      "persona": "em-obra|casa-pronta|ambos",
      "gatilho_principal": "information-gap|loss-aversion|contrarian|numero-concreto|status|timing|custo-inacao",
      "gancho": string (por que essa pessoa especifica salva — nao generico)
    }
  ]
}
Exatamente 12. Distribuicao: 5+ em-obra, 3+ casa-pronta, resto ambos. Gatilhos variados.`;
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

    // Curadoria DETERMINISTICA (sem 2a call Claude) — pega top 8 evitando
    // formulas/contextos repetidos. Prioriza em-obra e contrarian/info-gap.
    const scoreHeuristic = (c: any): number => {
      let s = 0;
      if (c.persona === "em-obra") s += 3;
      else if (c.persona === "ambos") s += 1;
      const gat = String(c.gatilho_principal || "").toLowerCase();
      if (gat.includes("information") || gat.includes("info-gap") || gat.includes("gap")) s += 3;
      if (gat.includes("contrarian") || gat.includes("loss")) s += 3;
      if (gat.includes("numero")) s += 2;
      if (gat.includes("timing")) s += 2;
      const formula = String(c.formula || "").toLowerCase();
      if (formula.includes("inspiracional")) s -= 2;
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
        persona: c.persona,
        gatilho: c.gatilho_principal,
      })),
    };
    return NextResponse.json(ideias);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
