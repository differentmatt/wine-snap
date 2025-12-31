"use client";

import { useState } from "react";

/* ---------- Types ---------- */

type Extracted = {
  producer: string | null;
  wine_name: string | null;
  vintage: string | null;
  region: string | null;
  country: string | null;
  grapes: string[] | string | null;
  appellation: string | null;
  abv: string | null;
  label_text_read: string | null;
  confidence_0_to_1: number | null;
};

type Enriched = {
  overview?: string;
  style_overview?: string;
  typical_tasting_notes?: string;
  food_pairings?: string[];
};

/* ---------- Helpers ---------- */

function formatGrapes(
  grapes: string | string[] | null | undefined
): string {
  if (!grapes) return "—";
  if (Array.isArray(grapes)) return grapes.join(", ");
  if (typeof grapes === "string") return grapes;
  return "—";
}

async function resizeToJpegBase64(
  file: File,
  maxDim = 1280,
  quality = 0.82
): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);

  URL.revokeObjectURL(url);
  return dataUrl.split(",")[1];
}

/* ---------- Component ---------- */

export default function Page() {
  const [status, setStatus] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [enriched, setEnriched] = useState<Enriched | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setStatus("Analyzing wine label…");
    setExtracted(null);
    setEnriched(null);
    setError(null);

    setPreviewUrl(URL.createObjectURL(file));

    try {
      const base64 = await resizeToJpegBase64(file);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: "image/jpeg",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(JSON.stringify(data, null, 2));
        setStatus("Error");
        return;
      }

      setExtracted(data.extracted ?? null);
      setEnriched(data.enriched ?? null);
      setStatus("Done");
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setStatus("Error");
    }
  }

  /* ---------- Styles ---------- */

  const bg = "#0b0b0c";
  const fg = "#f5f5f6";
  const cardBg = "#ffffff";
  const cardFg = "#111111";

  /* ---------- Render ---------- */

  return (
    <main
      style={{
        fontFamily: "system-ui",
        padding: 16,
        maxWidth: 760,
        margin: "0 auto",
        background: bg,
        color: fg,
        minHeight: "100vh",
      }}
    >
      <h1>Wine Snap</h1>
      <p style={{ opacity: 0.85 }}>
        Take a photo of a wine label to identify the bottle and get a guided explanation.
      </p>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => e.target.files && onPick(e.target.files[0])}
      />

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Wine label"
          style={{ marginTop: 12, maxWidth: "100%", borderRadius: 8 }}
        />
      )}

      {status && (
        <p style={{ marginTop: 12 }}>
          <strong>Status:</strong> {status}
        </p>
      )}

      {(extracted || enriched) && (
        <div
          style={{
            marginTop: 16,
            background: cardBg,
            color: cardFg,
            padding: 16,
            borderRadius: 10,
          }}
        >
          {enriched?.overview && (
            <>
              <h2 style={{ marginTop: 0 }}>Summary</h2>
              <p>{enriched.overview}</p>
            </>
          )}

          {enriched?.style_overview && (
            <>
              <h3>Style</h3>
              <p>{enriched.style_overview}</p>
            </>
          )}

          {enriched?.typical_tasting_notes && (
            <>
              <h3>Tasting notes</h3>
              <p>{enriched.typical_tasting_notes}</p>
            </>
          )}

          {enriched?.food_pairings?.length && (
            <>
              <h3>Food pairings</h3>
              <ul>
                {enriched.food_pairings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}

          <h3>From the label</h3>
          <ul>
            <li><strong>Producer:</strong> {extracted?.producer ?? "—"}</li>
            <li><strong>Wine:</strong> {extracted?.wine_name ?? "—"}</li>
            <li><strong>Vintage:</strong> {extracted?.vintage ?? "—"}</li>
            <li><strong>Region:</strong> {extracted?.region ?? "—"}</li>
            <li><strong>Country:</strong> {extracted?.country ?? "—"}</li>
            <li><strong>Grapes:</strong> {formatGrapes(extracted?.grapes)}</li>
            <li><strong>Appellation:</strong> {extracted?.appellation ?? "—"}</li>
          </ul>

          {extracted?.label_text_read && (
            <>
              <h4>Label text</h4>
              <pre
                style={{
                  background: "#f6f6f6",
                  color: "#111",
                  padding: 12,
                  borderRadius: 6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {extracted.label_text_read}
              </pre>
            </>
          )}

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
            Some details are inferred based on typical examples of this wine style.
          </p>
        </div>
      )}

      {error && (
        <pre
          style={{
            marginTop: 16,
            background: "#f6f6f6",
            color: "#111",
            padding: 12,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </pre>
      )}
    </main>
  );
}
