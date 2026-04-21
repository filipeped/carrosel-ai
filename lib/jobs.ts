import { getSupabase } from "./supabase";
import type { SlideData } from "./types";

/**
 * Helpers server-side pra trabalhar com render_jobs no Supabase.
 *
 * Job lifecycle:
 *   pending → running → done | error
 *
 * Cliente dispara via POST /api/render/submit (recebe jobId em ~200ms),
 * polla /api/render/status/[id] ate status=done, pega result.slides[].url.
 *
 * Desacopla totalmente o client do processamento — user pode fechar o
 * navegador ou bloquear o celular que o Vercel continua renderizando.
 */

export type RenderJobInput = {
  slides: SlideData[];
  imageUrls: string[];
  batchId?: string;
  upload?: boolean;
};

export type RenderJobResult = {
  slides: Array<{
    index: number;
    url: string;
    bytes: number;
    width: number;
    height: number;
  }>;
  elapsed_ms: number;
};

export type RenderJob = {
  id: string;
  status: "pending" | "running" | "done" | "error";
  input: RenderJobInput;
  result?: RenderJobResult;
  error?: string;
  progress: number;
  total_slides: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
};

const TABLE = "render_jobs";

export async function createJob(input: RenderJobInput): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      status: "pending",
      input,
      total_slides: input.slides.length,
      progress: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function markRunning(id: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from(TABLE)
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id);
}

export async function updateProgress(id: string, slidesDone: number, total: number): Promise<void> {
  const sb = getSupabase();
  const pct = total > 0 ? Math.round((slidesDone / total) * 100) : 0;
  await sb
    .from(TABLE)
    .update({ progress: pct, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markDone(id: string, result: RenderJobResult): Promise<void> {
  const sb = getSupabase();
  await sb
    .from(TABLE)
    .update({
      status: "done",
      result,
      progress: 100,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markError(id: string, error: string): Promise<void> {
  const sb = getSupabase();
  await sb
    .from(TABLE)
    .update({
      status: "error",
      error,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function getJob(id: string): Promise<RenderJob | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RenderJob) || null;
}

/**
 * URL base da instancia atual. Usa (por prioridade):
 * 1. NEXT_PUBLIC_BASE_URL (override manual)
 * 2. Header `host` + protocolo correto (funciona em Vercel + preview + local)
 * 3. VERCEL_URL automatico
 * 4. fallback localhost
 *
 * @param reqHeaders opcional — headers do request pra extrair host
 */
export function getSelfUrl(reqHeaders?: Headers): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (reqHeaders) {
    const host = reqHeaders.get("host");
    const proto = reqHeaders.get("x-forwarded-proto") || "https";
    if (host) return `${host.startsWith("localhost") ? "http" : proto}://${host}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
