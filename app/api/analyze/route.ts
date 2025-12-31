export const runtime = "nodejs";

function stripMarkdownCodeFences(s: string) {
  // Handles ```json ... ``` or ``` ... ```
  return s.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
}

export async function POST(req: Request) {
  try {
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64 || !mediaType) {
      return Response.json({ error: "Missing imageBase64 or mediaType" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              {
                type: "text",
                text:
                  "Return STRICT JSON ONLY (no markdown, no code fences) with keys: " +
                  "producer, wine_name, vintage, region, country, grapes, appellation, abv, " +
                  "tasting_notes, likely_price_range_usd, confidence_0_to_1, label_text_read. " +
                  "Use null if unknown.",
              },
            ],
          },
        ],
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return Response.json({ error: "Anthropic error", details: data }, { status: 500 });
    }

    const text = data?.content?.find((c: any) => c.type === "text")?.text ?? "";
    const cleaned = stripMarkdownCodeFences(text);

    try {
      const parsed = JSON.parse(cleaned);
      return Response.json({ result: parsed });
    } catch {
      return Response.json(
        { error: "Model did not return valid JSON", raw: cleaned },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return Response.json({ error: "Server error", details: String(e?.message ?? e) }, { status: 500 });
  }
}
