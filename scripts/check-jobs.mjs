import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await sb
  .from("render_jobs")
  .select("id, status, progress, total_slides, error, created_at, started_at, finished_at")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error("ERRO:", error.message);
  process.exit(1);
}

if (!data?.length) {
  console.log("⚠️  Nenhum job em render_jobs — worker nunca foi chamado");
  process.exit(0);
}

for (const j of data) {
  const created = new Date(j.created_at);
  const startedDelay = j.started_at
    ? ((new Date(j.started_at) - created) / 1000).toFixed(1) + "s"
    : "NUNCA";
  const durationStr = j.finished_at
    ? ((new Date(j.finished_at) - new Date(j.started_at)) / 1000).toFixed(1) + "s"
    : "";
  console.log(
    `${j.id.slice(0, 8)} | ${j.status.padEnd(7)} | ${j.progress}% | ` +
      `delay_to_start=${startedDelay} | dur=${durationStr} | ${j.error?.slice(0, 80) || ""}`,
  );
}
