// Types compartilhados do app.

export type AnaliseVisual = {
  qualidade: number;
  composicao: number;
  luz: number;
  cover_potential: number;
  descricao_visual: string;
  hero_element: string;
  mood_real: string[];
  palavras_chave: string[];
};

export type ImageRow = {
  id: number;
  arquivo: string;
  url: string;
  estilo: string[];
  plantas: string[];
  mood: string[];
  tipo_area: string;
  descricao: string;
  analise_visual?: AnaliseVisual;
};

export type SlideKind = "cover" | "inspiration" | "plantDetail" | "cta";

export type SlideData = {
  type: SlideKind;
  imageIdx: number;
  topLabel?: string;
  numeral?: string | null;
  title?: string;
  italicWords?: string[];
  subtitle?: string;
  nomePopular?: string | null;
  nomeCientifico?: string | null;
  pergunta?: string;
  fechamento?: string;
};

export type Selection = {
  cover: ImageRow;
  inner: ImageRow[];
  cta: ImageRow;
  alternatives: ImageRow[];
  rationale?: string;
};

export type CaptionOption = {
  abordagem: string;
  hook: string;
  legenda: string;
  hashtags: string[];
};

export type ProgressState = { pct: number; phase: string; etaSec: number } | null;
