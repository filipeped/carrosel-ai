// 16 angulos virais pre-validados pro formato CATALOG.
// Cada angulo amarra: problema concreto + framework de hook + filtro de plantas.
// Em vez do usuario digitar tema cru, ele escolhe um angulo — o que ja garante
// viralidade (problema real da dona-de-casa).

import type { HookFrameworkKey } from "./brand-context";

export type CatalogAngle = {
  id: string;
  emoji: string;
  titulo: string;        // vira o prompt enviado pra IA
  hint: string;          // 1 linha curta abaixo do titulo
  framework: HookFrameworkKey;
  // Filtros aplicados ao pool de plantas (ILIKE casa-insensitive)
  filter?: {
    luminosidade?: string[]; // termos: "sombra", "sol pleno", "meia sombra", "luz difusa"
    categorias?: string[];   // termos: "Trepadeiras", "Folhagens", "Cercas Vivas", etc
  };
};

export const CATALOG_ANGLES: CatalogAngle[] = [
  {
    id: "corredor-sombra",
    emoji: "🌿",
    titulo: "A planta que resolve corredor lateral sem sol",
    hint: "Espaco esquecido do projeto, plantas que aguentam luz indireta e pisoteio",
    framework: "observacao_de_quem_entende",
    filter: { luminosidade: ["luz difusa", "meia sombra"], categorias: ["Folhagens"] },
  },
  {
    id: "substitui-hortensia",
    emoji: "🌸",
    titulo: "Substitutas premium da hortensia em SP",
    hint: "Florescem mais tempo, sem drama de pH ou clima frio",
    framework: "quebra_expectativa",
    filter: { luminosidade: ["sol pleno", "meia sombra"], categorias: ["Flores Perenes"] },
  },
  {
    id: "cerca-viva-zero-manutencao",
    emoji: "🪴",
    titulo: "Cerca viva sem dor de manutencao: 5 especies",
    hint: "Crescem densas, exigem podas espaçadas, presença real de fechamento",
    framework: "manifesto_tese",
    filter: { categorias: ["Cercas Vivas"] },
  },
  {
    id: "fachada-valoriza",
    emoji: "🌳",
    titulo: "Plantas que dobram o valor visual da fachada",
    hint: "Escala, presença, assinatura visível da rua",
    framework: "revelacao",
    filter: { luminosidade: ["sol pleno"], categorias: ["Árvores Ornamentais", "Palmeiras"] },
  },
  {
    id: "piscina-sol-forte",
    emoji: "🌴",
    titulo: "Plantas que aguentam sol forte na piscina",
    hint: "Tolerância a respingo de cloro, sem queda de folha caotica",
    framework: "observacao_de_quem_entende",
    filter: { luminosidade: ["sol pleno"], categorias: ["Palmeiras", "Arbustos Tropicais"] },
  },
  {
    id: "areca-fachada-erro",
    emoji: "⚠️",
    titulo: "O erro com palmeira-areca na fachada",
    hint: "Cresce muito, perde porte, vira problema em 4 anos",
    framework: "revelacao",
    filter: { categorias: ["Palmeiras"] },
  },
  {
    id: "folhagens-sombra-iluminam",
    emoji: "✨",
    titulo: "Folhagens que iluminam ambiente sombreado",
    hint: "Cor, textura, brilho mesmo sem sol direto",
    framework: "sensorial",
    filter: { luminosidade: ["luz difusa", "meia sombra"], categorias: ["Folhagens"] },
  },
  {
    id: "trepadeiras-rapidas",
    emoji: "🌿",
    titulo: "Trepadeiras que crescem rapido sem invadir",
    hint: "Cobrem muro em 18 meses, raiz controlada, manejo previsivel",
    framework: "comportamento_do_jardim",
    filter: { categorias: ["Trepadeiras"] },
  },
  {
    id: "forracoes-substitutas-grama",
    emoji: "🍃",
    titulo: "Forracoes que substituem grama em area complicada",
    hint: "Onde grama nao vinga, essas resolvem com menos manutencao",
    framework: "quebra_expectativa",
    filter: { categorias: ["Forrações ao Sol Pleno", "Forrações à Meia Sombra"] },
  },
  {
    id: "ancoras-projeto-novo",
    emoji: "🌱",
    titulo: "Plantas-ancora pra projeto novo nos 3 primeiros anos",
    hint: "Crescem rapido e seguram volume enquanto o resto desenvolve",
    framework: "comportamento_do_jardim",
    filter: { luminosidade: ["sol pleno"], categorias: ["Arbustos", "Arbustos Tropicais"] },
  },
  {
    id: "suculentas-inverno-sp",
    emoji: "🌵",
    titulo: "Suculentas que sobrevivem ao inverno paulista",
    hint: "Resistem a noites frias e umidade alta — nao apodrecem",
    framework: "observacao_de_quem_entende",
    filter: { categorias: ["Cactos e Suculentas"] },
  },
  {
    id: "florescem-ano-todo",
    emoji: "🌺",
    titulo: "Plantas que florescem o ano todo em SP",
    hint: "Floração quase contínua, sem janela de jardim 'morto'",
    framework: "manifesto_tese",
    filter: { categorias: ["Flores Perenes"] },
  },
  {
    id: "cinco-de-todo-projeto",
    emoji: "🏡",
    titulo: "5 plantas em quase todo projeto premium",
    hint: "As mais usadas em projetos sofisticados — nao por moda, por estrutura",
    framework: "revelacao",
  },
  {
    id: "palmeiras-pequenas-area",
    emoji: "🌴",
    titulo: "Palmeiras pra area externa pequena",
    hint: "Escala vertical sem invadir o terreno do vizinho",
    framework: "observacao_de_quem_entende",
    filter: { categorias: ["Palmeiras"] },
  },
  {
    id: "atrativos-passaros",
    emoji: "🐦",
    titulo: "Plantas que atraem beija-flor sem virar bagunca",
    hint: "Floracao especifica + estrutura controlada",
    framework: "sensorial",
    filter: { categorias: ["Flores Perenes", "Arbustos"] },
  },
  {
    id: "estaca-ipe-cedo",
    emoji: "🌳",
    titulo: "Arvores que valem a espera de 5 anos",
    hint: "Plantar agora, lembrar depois — quem espera ganha jardim adulto",
    framework: "historia_da_planta",
    filter: { luminosidade: ["sol pleno"], categorias: ["Árvores Ornamentais"] },
  },
];
