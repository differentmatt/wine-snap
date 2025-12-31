"use client";

import { useState } from "react";

type Result = {
  producer: string | null;
  wine_name: string | null;
  vintage: string | null;
  region: string | null;
  country: string | null;
  grapes: string[] | null;
  appellation: string | null;
  abv: string | null;
  tasting_notes: string | null;
  likely_price_range_usd: string | null;
  confidence_0_to_1: number | null;
  label_text_read: string | null;
};

function Field({ label, value }: { label: string; value: any }) {
  const display =
    value === null || value === undefined
      ? "—"
      : Array.isArray(value)
      ? value.join(", ")
      : String(value);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 16 }}>{display}</div>
    </div>
  );
}

function clamp01(n: any): number | null {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(1, x));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function downscaleToJpegBase64(file: File, maxDim = 1280, quality = 0.82) {
  const dataUrl = await fileToDataUrl(file);
  const img = new Image();
  img.src = dataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });

  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.drawImage(img, 0, 0, w, h);

  const outDataUrl = canvas.toDataURL("image/jpeg", quality);
  const base64 = outDataUrl.split(",")[1];
  return { base64, mediaType: "image/jpeg" as const };
}

export default function Page() {
  const [status, setStatus] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function onPick(file: File) {
    setStatus("Preparing image…");
    setResult(null);
    setRaw(null);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    try {
      const { base64, mediaType } = await downscaleToJpegBase64(file);

      setStatus("Analyzing…");
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("Error");
        setRaw(JSON.stringify(data, null, 2));
        return;
      }

      setStatus("Done");

      if (data?.result) {
        const r = data.result;
        const normalized: Result = {
          producer: r.producer ?? null,
          wine_name: r.wine_name ?? null,
          vintage: r.vintage ?? null,
          region: r.region ?? null,
          country: r.country ?? null,
          grapes: Array.isArray(r.grapes) ? r.grapes : r.grapes ? [String(r.grapes)] : null,
          appellation: r.appellation ?? null,
          abv: r.abv ?? null,
          tasting_notes: r.tasting_notes ?? null,
          likely_price_range_usd: r.likely_price_range_usd ?? null,
          confidence_0_to_1: clamp01(r.confidence_0_to_1),
          label_text_read: r.label_text_read ?? null,
        };
        setResult(normalized);
      } else {
        setRaw(JSON.stringify(data, null, 2));
      }
    } catch (e: any) {
      setStatus("Error");
      setRaw(String(e?.message ?? e));
    }
  }

  // Force readable colors regardless of OS/browser dark mode
  const pageBg = "#0b0b0c";
  const pageFg = "#f5f5f6";
  const cardBg = "#ffffff";
  const cardFg = "#111111";
  const preBg = "#f6f6f6";
  const preFg = "#111111";

  return (
    <main
      style={{
        fontFamily: "system-ui",
        padding: 16,
        maxWidth: 700,
        margin: "0 auto",
        background: pageBg,
        color: pageFg,
        minHeight: "100vh",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Wine Snap</h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>
        Choose a photo of a wine label. It sends it to Claude and returns structured info.
      </p>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
        style={{ marginTop: 8 }}
      />

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Selected wine bottle"
          style={{ display: "block", maxWidth: "100%", marginTop: 12, borderRadius: 8 }}
        />
      )}

      {status && (
        <p style={{ marginTop: 12 }}>
          <strong>Status:</strong> {status}
        </p>
      )}

      {result && (
        <div
          style={{
            marginTop: 16,
            background: cardBg,
            color: cardFg,
            padding: 12,
            borderRadius: 8,
          }}
        >
          <Field label="Producer" value={result.producer} />
          <Field label="Wine" value={result.wine_name} />
          <Field label="Vintage" value={result.vintage} />
          <Field label="Region" value={result.region} />
          <Field label="Country" value={result.country} />
          <Field label="Grapes" value={result.grapes} />
          <Field label="Appellation" value={result.appellation} />
          <Field label="ABV" value={result.abv} />
          <Field label="Price (USD)" value={result.likely_price_range_usd} />
          <Field label="Confidence" value={result.confidence_0_to_1} />
          <Field label="Tasting notes" value={result.tasting_notes} />
        </div>
      )}

      {result?.label_text_read && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }}>Label text (what the model read)</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: preBg,
              color: preFg,
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            {result.label_text_read}
          </pre>
        </details>
      )}

      {raw && (
        <>
          <p style={{ marginTop: 12 }}>
            <strong>Raw output (debug):</strong>
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: preBg,
              color: preFg,
              padding: 12,
              borderRadius: 8,
            }}
          >
            {raw}
          </pre>
        </>
      )}
    </main>
  );
}
