"use client";
import { useState } from "react";

type Mode = "identifier" | "thematic";

export default function Home() {
  const [mode, setMode] = useState<Mode>("identifier");

  return (
    <main className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <header className="mb-10">
        <div className="text-xs tracking-[4px] uppercase opacity-70">Digital Paisagismo</div>
        <h1 className="mt-2 text-4xl md:text-5xl font-serif" style={{ fontFamily: "Georgia, serif" }}>
          Gerador de <i>Carrossel</i>
        </h1>
        <p className="mt-2 opacity-80 text-sm">
          Alto padrao, direto ao feed. Identifique uma planta ou descreva um tema.
        </p>
      </header>

      <div className="flex gap-2 mb-8 border-b border-white/10">
        {(["identifier", "thematic"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm tracking-wider uppercase transition-colors ${
              mode === m ? "border-b-2 border-white text-white" : "opacity-60 hover:opacity-100"
            }`}
          >
            {m === "identifier" ? "Identificar Planta" : "Tematico"}
          </button>
        ))}
      </div>

      {mode === "identifier" ? <Identifier /> : <Thematic />}
    </main>
  );
}

function Identifier() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  async function run() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setStep("Identificando planta...");
      const b64 = await toBase64(file);
      const idRes = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: file.type }),
      });
      const id = await idRes.json();
      if (id.error || !id.nome_cientifico) throw new Error(id.error || "nao identificou");

      setStep("Buscando fotos do banco...");
      // busca imagens que contenham a planta
      const imgRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: id.nome_cientifico + " " + id.nome_popular, count: 5 }),
      });
      const imgs = await imgRes.json();

      setStep("Gerando carrossel (pode levar 30-60s)...");
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "identifier",
          plant: { ...id, ...(id.vegetacao_match || {}) },
          images: imgs.imagens || [],
        }),
      });
      const gen = await genRes.json();
      if (gen.error) throw new Error(gen.error);
      setResult({ identified: id, generated: gen });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setStep("");
    }
  }

  return (
    <section>
      <div className="border border-white/15 rounded p-6 bg-white/[0.02]">
        <label className="block mb-3 text-sm opacity-80">Foto da planta</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block text-sm"
        />
        {file && (
          <div className="mt-4">
            <img src={URL.createObjectURL(file)} className="max-h-64 rounded" alt="preview" />
          </div>
        )}
        <button
          disabled={!file || loading}
          onClick={run}
          className="mt-6 bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? step || "Processando..." : "Gerar Carrossel"}
        </button>
      </div>
      {error && <div className="mt-4 text-red-300 text-sm">Erro: {error}</div>}
      {result && <Result data={result} />}
    </section>
  );
}

function Thematic() {
  const [prompt, setPrompt] = useState("5 plantas tropicais pra jardim pequeno sombreado");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function run() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setStep("Buscando imagens no banco...");
      const imgRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count: 6 }),
      });
      const imgs = await imgRes.json();
      if (imgs.error) throw new Error(imgs.error);

      setStep("Gerando carrossel...");
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "thematic",
          prompt,
          images: imgs.imagens || [],
        }),
      });
      const gen = await genRes.json();
      if (gen.error) throw new Error(gen.error);
      setResult({ prompt, generated: gen, imgs });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setStep("");
    }
  }

  return (
    <section>
      <div className="border border-white/15 rounded p-6 bg-white/[0.02]">
        <label className="block mb-3 text-sm opacity-80">Tema do carrossel</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm"
          placeholder="Ex: 5 plantas pra area externa de sol pleno..."
        />
        <button
          disabled={loading}
          onClick={run}
          className="mt-4 bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs disabled:opacity-40"
        >
          {loading ? step || "Gerando..." : "Gerar Carrossel"}
        </button>
      </div>
      {error && <div className="mt-4 text-red-300 text-sm">Erro: {error}</div>}
      {result && <Result data={result} />}
    </section>
  );
}

function Result({ data }: { data: any }) {
  const g = data.generated;
  if (!g?.pngs) return null;
  return (
    <div className="mt-8">
      {data.identified && (
        <div className="mb-6 text-sm opacity-80">
          Identificado: <b>{data.identified.nome_popular}</b> (
          <i>{data.identified.nome_cientifico}</i>) — confianca{" "}
          {Math.round((data.identified.confianca ?? 0) * 100)}%
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {g.pngs.map((b64: string, i: number) => (
          <a
            key={i}
            href={`data:image/png;base64,${b64}`}
            download={`slide-${String(i + 1).padStart(2, "0")}.png`}
            className="block"
          >
            <img
              src={`data:image/png;base64,${b64}`}
              className="w-full rounded border border-white/10"
              alt={`slide ${i + 1}`}
            />
          </a>
        ))}
      </div>
      <div className="mt-6">
        <a
          href={`data:application/pdf;base64,${g.pdf}`}
          download="carrossel.pdf"
          className="inline-block bg-white text-black px-5 py-2.5 rounded tracking-wider uppercase text-xs"
        >
          Baixar PDF completo
        </a>
      </div>
    </div>
  );
}

async function toBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
