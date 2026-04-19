import { NextRequest, NextResponse } from "next/server";
import { getAi, MODEL } from "@/lib/claude";
import { extractJson } from "@/lib/utils";
import { getBrandVoiceReferences } from "@/lib/brand-voice";

export const runtime = "nodejs";
export const maxDuration = 45;

// ---------------------------------------------------------------------------
// Persona + contexto real do perfil
// ---------------------------------------------------------------------------
const PERSONA = `Voce e estrategista de conteudo do @digitalpaisagismo. Perfil brasileiro de paisagismo que fecha projetos R$ 200k+.

PUBLICO REAL que ENGAJA com o perfil:
- DONOS DE CASA (80%) — querendo contratar projeto paisagistico, pesquisando referencias antes de falar com paisagista
- ARQUITETOS (15%) — buscando repertorio pra mostrar ao cliente
- PAISAGISTAS (5%) — comparando tecnica, pouco salvam

OBJETIVO: ideias que o DONO DE CASA salva pra mostrar ao marido/esposa/arquiteto, nao o paisagista pra debater tecnica.`;

// ---------------------------------------------------------------------------
// Calibracao pelos posts REAIS que viraram
// ---------------------------------------------------------------------------
const CALIBRACAO = `CALIBRACAO DE VIRALIDADE — tom que REALMENTE performa no perfil:

Posts que deram certo (exemplos reais, ordenados por saves):
1. "Quando a area externa faz sentido, voce para de viver so dentro de casa"
   — 249 saves. Fala do USO do espaco, nao da tecnica. Emocional e direto.

2. "Sua casa merece um projeto que conecte cada ambiente com a natureza"
   — 170 saves. Promessa clara. Conecta casa + natureza + vida.

3. "A maioria dos jardins de alto padrao usa as mesmas 5 plantas. Nao e coincidencia."
   — 58 saves. Abre curiosidade. Promessa de revelacao.

4. "Um bom paisagismo nao e so sobre plantas. E sobre criar espacos que fazem sentido com a sua rotina, com o clima e com a arquitetura da sua casa."
   — 94 saves. Repositiona a expectativa. Inclui "sua rotina".

5. "Chegar em casa e sentir a natureza abraçando cada detalhe"
   — 68 saves. Imagem sensorial. Zero tecnicismo.

PADROES que viralizam:
- Fala do RESULTADO no dia a dia do dono ("voce para de viver so dentro de casa", "chegar em casa e sentir")
- Contradiz uma intuicao simples do leigo, nao um detalhe tecnico
- Promessa curta, emocional, visualizavel
- Linguagem de CASA, ROTINA, VIDA — nao de paisagismo/botanica
- Pode usar "sua casa", "seu jardim" — fala direto com o leitor`;

const CONTRA_EXEMPLOS = `ANTI-PADROES — tipo de ideia que NAO VIRALIZA no @digitalpaisagismo:

[TECNIQUES DEMAIS] "Como construir estratificacao vertical em entrada com tres planos de dossel"
  — So paisagista entende. Dono de casa nao salva.

[AUTORIA PEDANTE] "O principio de espelho que Isabel Duprat usa pra dobrar profundidade em jardins lineares"
  — Nome da referencia afasta quem nao conhece.

[AUTORIDADE VAZIA] "Vocabulario de fitossociologia aplicado a decisao de projeto real"
  — Palavra tecnica sem contexto vital.

[CONTRASTE TECNICO] "Por que pergolado com trepadeira rasteira entrega mais sombra qualificada que cobertura rigida"
  — "sombra qualificada" nao e linguagem de dono de casa.

[HIPER-ESPECIFICO] "4 Bromeliaceae terrestres em muro verde fachada norte sem irrigacao forcada"
  — nome de familia botanica + parametro tecnico = 0 saves.

Regra: se voce precisa TRADUZIR o titulo pro leigo entender, e tecnico demais.`;

// ---------------------------------------------------------------------------
// Fórmulas que funcionam no perfil
// ---------------------------------------------------------------------------
const FORMULAS = `FORMULAS que ja viralizaram no perfil:

1. "Quando [situacao da casa], voce [resultado na vida]"
   Ex: "Quando o jardim conversa com a casa, voce nao quer mais viver so dentro dela"

2. "Sua casa merece [beneficio emocional]"
   Ex: "Sua casa merece um jardim que sobrevive ao seu ritmo, nao o contrario"

3. "A maioria dos [contexto] usa [algo simples]. Nao e coincidencia."
   Ex: "A maioria das casas de alto padrao tem 3 plantas iguais na entrada. Nao e coincidencia."

4. "[Atividade cotidiana] muda quando [projeto paisagistico]"
   Ex: "O cafe da manha muda quando voce pode tomar olhando um jardim projetado"

5. "N plantas que [beneficio pratico]" — numeros 3/4/5 so
   Ex: "5 plantas que tornam qualquer varanda maior visualmente"

6. "Antes de contratar, [verdade sobre paisagismo]"
   Ex: "Antes de contratar paisagismo, pergunte isso — e nao seja enganado"

7. "O erro que [resultado caro]"
   Ex: "O erro que faz qualquer jardim bom parecer descuidado em 6 meses"

8. "[Referencia visual concreta]"
   Ex: "Chegar em casa e ver o jardim iluminado te muda o dia"

9. "N coisas que [beneficio]" (numeros 3/4/5)
   Ex: "3 decisoes de projeto que valem mais que escolher as plantas"

10. "Contrario do que voce pensa [verdade inesperada]"
    Ex: "Contrario do que parece, quanto menos espacos separados, mais amplo o jardim fica"`;

// ---------------------------------------------------------------------------
// System: gerar 16 ideias
// ---------------------------------------------------------------------------
function buildGenerateSystem(voiceRefs: string): string {
  return `${PERSONA}

${CALIBRACAO}

${CONTRA_EXEMPLOS}

${FORMULAS}

${voiceRefs ? `EXEMPLOS REAIS DO PERFIL (mais uma referencia):\n\n${voiceRefs}\n\n` : ""}

TAREFA: gerar 16 ideias que SOEM NO MESMO TOM dos exemplos acima. Cada ideia em contexto diferente. Sera filtrado pra 8 depois.

REGRAS DURAS:
- Titulo fala pro DONO DE CASA, nao pro paisagista
- Entre 7 e 14 palavras
- Linguagem emocional + concreta (casa, rotina, vida, dia a dia, familia)
- Pode citar: jardim, entrada, varanda, area externa, piscina, rooftop, casa de campo, casa de praia, pergolado, deck, quintal
- Pode citar MUITO POUCO: termos tecnicos, nomes cientificos, paisagistas famosos, materiais obscuros
- Numeros em lista: 3, 4 ou 5 apenas (carrossel tem 4 slides internos)
- Proibido: "alto padrao" explicito repetido, "imperdivel", "incrivel", "confira", "top", "dicas", emoji, hashtag

RETORNE JSON PURO:
{
  "candidatas": [
    {
      "titulo": string,
      "formula": "situacao-resultado|sua-casa|maioria|atividade|lista-n|antes-contratar|erro|visual|contrario|outro",
      "contexto": string (ex: "varanda", "entrada", "rooftop", "casa-campo"),
      "gancho_emocional": string (por que o dono da casa salvaria essa ideia)
    }
  ]
}
Exatamente 16. Tons variados, contextos variados.`;
}

// ---------------------------------------------------------------------------
// System: curadoria 16 -> 8
// ---------------------------------------------------------------------------
const CURATE_SYSTEM = `Voce e editor do @digitalpaisagismo. Recebeu 16 candidatas de ideia.

Selecione 8 pensando no DONO DE CASA que salva (nao no paisagista que debate).

Elimine em ordem:
1. Qualquer uma com linguagem tecnica que um cliente leigo nao entende (fitossociologia, dossel, estratificacao, "sombra qualificada", nomes cientificos, nomes de paisagistas famosos ja conhecidos)
2. Contextos repetidos (max 1 em "varanda", max 1 em "piscina")
3. Formulas repetidas (max 2 da mesma)
4. Ideias SEM gancho emocional claro
5. Prefira as que soam como algo que ALGUEM REAL diria em conversa sobre casa

Retorne JSON puro:
{
  "ideias": [
    { "titulo": string, "hook": string }
  ]
}
Exatamente 8. Ordene da mais forte pra mais fraca (em termos de potencial de save pelo dono de casa).`;

export async function POST(req: NextRequest) {
  try {
    const { nicho } = await req.json().catch(() => ({}));

    // Busca referencias reais do perfil (top-20 posts)
    const voiceRefs = await getBrandVoiceReferences().catch(() => "");

    // ETAPA 1
    const gen = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 2400,
      messages: [
        { role: "system", content: buildGenerateSystem(voiceRefs) },
        {
          role: "user",
          content: nicho
            ? `Interesse: "${nicho}". So 1 das 16 pode tocar nisso; 15 exploram outros contextos com tom DIRETO AO DONO DE CASA. JSON puro.`
            : "16 candidatas, tons variados, sempre falando ao DONO DE CASA com linguagem emocional e concreta. JSON puro.",
        },
      ],
    });
    const genRaw = gen.choices[0]?.message?.content || "";
    let candidatas: any[] = [];
    try {
      const parsed: any = extractJson(genRaw);
      candidatas = Array.isArray(parsed) ? parsed : parsed.candidatas || [];
    } catch {
      return NextResponse.json({ error: "IA JSON invalido (etapa 1)", raw: genRaw.slice(0, 300) }, { status: 500 });
    }
    if (candidatas.length < 6) {
      return NextResponse.json({ error: `Apenas ${candidatas.length} candidatas`, candidatas }, { status: 500 });
    }

    // ETAPA 2: curadoria
    const cur = await getAi().chat.completions.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [
        { role: "system", content: CURATE_SYSTEM },
        {
          role: "user",
          content: `16 candidatas:\n${JSON.stringify(candidatas, null, 2)}\n\nSelecione as 8 mais fortes. JSON puro.`,
        },
      ],
    });
    const curRaw = cur.choices[0]?.message?.content || "";
    let ideias: any = {};
    try {
      const parsed: any = extractJson(curRaw);
      ideias = Array.isArray(parsed) ? { ideias: parsed } : parsed;
    } catch {
      return NextResponse.json({
        ideias: candidatas.slice(0, 8).map((c) => ({ titulo: c.titulo, hook: c.gancho_emocional || "" })),
        _fallback: "curadoria falhou",
      });
    }
    return NextResponse.json(ideias);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
