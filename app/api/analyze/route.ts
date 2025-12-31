export const runtime = "nodejs";

function stripMarkdownCodeFences(s: string) {
  return s.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
}

async function callAnthropic(apiKey: string, body: any) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic error: ${JSON.stringify(data)}`);
  const text = data?.content?.find((c: any) => c.type === "text")?.text ?? "";
  return stripMarkdownCodeFences(text);
}

export async function POST(req: Request) {
  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64 || !mediaType) {
      return Response.json({ error: "Missing imageBase64 or mediaType" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

    // PASS A: label-grounded extraction
    const extractText = await callAnthropic(apiKey, {
      model: "claude-sonnet-4-5",
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            {
              type: "text",
              text:
                "Task A (EXTRACT ONLY): Read the wine label. " +
                "Return STRICT JSON ONLY with keys: " +
                "producer, wine_name, vintage, region, country, grapes, appellation, abv, " +
                "label_text_read, confidence_0_to_1. " +
                "Rules: Use null if not explicitly supported by label text. Do not guess.",
            },
          ],
        },
      ],
    });

    let extracted: any;
    try {
      extracted = JSON.parse(extractText);
    } catch {
      return Response.json({ error: "Extraction not valid JSON", raw: extractText }, { status: 502 });
    }

    // PASS B: enrichment (explicitly separated from what was read)
    const enrichText = await callAnthropic(apiKey, {
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
              "Task B (ENRICH, USER-FACING): You are writing the kind of rich explanation a knowledgeable sommelier " +
              "or wine guide would give after seeing this label.\n\n" +

              "Using ONLY the extracted fields and label_text_read below, return STRICT JSON ONLY with these keys:\n\n" +

              "- overview: 2–3 sentences explaining what this wine is, in plain language.\n" +
              "- style_overview: what kind of wine this is stylistically (body, fruit vs earth, old/new world, etc).\n" +
              "- typical_tasting_notes: bullet-style list or short paragraph of common flavors/aromas for this style.\n" +
              "- food_pairings: 4–6 concrete food pairing examples.\n" +
              "- serving: { temperature_c, decanting, glassware }.\n" +
              "- aging_window: how this wine is typically enjoyed over time.\n" +
              "- producer_background: short background on the producer IF well known, otherwise null.\n" +
              "- region_background: short explanation of the region/appellation and why it matters.\n" +
              "- price_context: how the stated price range compares to similar wines.\n" +
              "- uncertainties: list what cannot be known from the label alone.\n" +
              "- followup_questions: questions a curious drinker might ask next.\n\n" +

              "Rules:\n" +
              "- Be explicit about what is inferred or typical.\n" +
              "- Do NOT invent awards, critic scores, or exact technical details unless present in the label text.\n" +
              "- If something is unknown, say so.\n" +
              "- JSON only. No markdown.\n\n" +

              "EXTRACTED_JSON:\n" +
              JSON.stringify(extracted),

            },
          ],
        },
      ],
    });

    let enriched: any;
    try {
      enriched = JSON.parse(enrichText);
    } catch {
      // still return extracted if enrichment fails
      return Response.json({ extracted, enrichment_error: "Enrichment not valid JSON", raw: enrichText });
    }

    return Response.json({ extracted, enriched });
  } catch (e: any) {
    return Response.json({ error: "Server error", details: String(e?.message ?? e) }, { status: 500 });
  }
}
