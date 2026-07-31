const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Provider = "openai" | "gemini" | "grok";

const stylePrompts = [
  "Use only one black ballpoint pen. Loose contour drawing, small hesitant corrections, asymmetrical and slightly cropped composition.",
  "Use only one green felt-tip pen. Chunky minimal contour, off-center composition, distorted proportions, very few details.",
  "Use only one BLACK pen with no other colors. Draw badly like an unskilled person using a slippery computer mouse. Use exactly 5 to 15 long connected strokes total: inaccurate proportions, visibly shaky curves, awkward overlaps, missed connections, accidental overshoots, incomplete objects, and large empty areas. Never use dots, stippling, dashed lines, shading, filled areas, or color. The result must look clumsy, rushed, and amateur, never polished."
];

function promptFor(word: string, variation: number) {
  return [
    `Draw this subject: ${word}.`,
    "Make it look like a quick drawing made by a person using a mouse in a simple web paint program.",
    "Pure white background. ONE physical pen color only. Simple outline strokes only.",
    "ABSOLUTELY NO written words, letters, Korean characters, labels, calligraphy, pen or pencil shown in the image, photograph, shading, gradients, textures, realistic lighting, typography, border, frame, or signature.",
    "Do not draw any facial expression. Avoid perfect circles, straight lines, symmetry, and polished vector shapes.",
    stylePrompts[Math.abs(variation) % stylePrompts.length]
  ].join(" ");
}

async function openAiImage(prompt: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1-mini",
      prompt,
      size: "1024x1024",
      quality: "low",
      output_format: "png"
    })
  });
  const data = await response.json();
  if (!response.ok || !data?.data?.[0]?.b64_json) throw new Error(data?.error?.message || `OpenAI ${response.status}`);
  return `data:image/png;base64,${data.data[0].b64_json}`;
}

function findGeminiImage(value: unknown): { data: string; mime: string } | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const data = typeof object.data === "string" ? object.data : undefined;
  const mime = typeof object.mime_type === "string" ? object.mime_type
    : typeof object.mimeType === "string" ? object.mimeType : undefined;
  const type = typeof object.type === "string" ? object.type : "";
  if (data && (type === "image" || mime?.startsWith("image/"))) return { data, mime: mime || "image/png" };
  for (const child of Object.values(object)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findGeminiImage(item);
        if (found) return found;
      }
    } else {
      const found = findGeminiImage(child);
      if (found) return found;
    }
  }
  return null;
}

async function geminiImage(prompt: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is missing");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image",
      input: prompt,
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "1:1", image_size: "512" }
    })
  });
  const data = await response.json();
  const image = findGeminiImage(data);
  if (!response.ok || !image) throw new Error(data?.error?.message || `Gemini ${response.status}`);
  return `data:${image.mime};base64,${image.data}`;
}

async function grokStrokePlan(subject: string, seed: number) {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("XAI_API_KEY is missing");
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.3",
      messages: [
        {
          role: "system",
          content: `Design a crude but recognizable mouse drawing on a 0-100 coordinate canvas. Use only essential silhouettes and parts. Make proportions awkward and lines slightly shaky. Never add facial expressions, frames, ground decorations, repeated symbols, text, dots, shading, color, or tiny details. Keep every coordinate between 8 and 92. Random seed: ${seed}.`
        },
        { role: "user", content: `제시어를 검은 펜 선 5~15개로 알아볼 수 있게 그려 주세요: ${subject}` }
      ],
      temperature: 0.9,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rough_drawing",
          strict: true,
          schema: {
            type: "object",
            properties: {
              strokes: {
                type: "array",
                minItems: 5,
                maxItems: 15,
                items: {
                  type: "object",
                  properties: {
                    points: {
                      type: "array",
                      minItems: 2,
                      maxItems: 14,
                      items: {
                        type: "object",
                        properties: { x: { type: "number" }, y: { type: "number" } },
                        required: ["x", "y"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["points"],
                  additionalProperties: false
                }
              }
            },
            required: ["strokes"],
            additionalProperties: false
          }
        }
      }
    })
  });
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!response.ok || !text) {
    const detail = typeof data?.error === "string"
      ? data.error
      : data?.error?.message || data?.error?.code || JSON.stringify(data?.error || data);
    throw new Error(`xAI ${response.status}: ${detail}`);
  }
  const parsed = JSON.parse(text) as { strokes?: Array<{ points?: Array<{ x?: number; y?: number }> }> };
  const strokes = (parsed.strokes || []).slice(0, 15).map(stroke =>
    (stroke.points || []).slice(0, 14).map(point => [
      Math.max(8, Math.min(92, Number(point.x))),
      Math.max(8, Math.min(92, Number(point.y)))
    ])
  ).filter(stroke => stroke.length >= 2);
  if (strokes.length < 5) throw new Error("Grok returned too few strokes");
  return strokes;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json() as { word?: string; provider?: Provider; variation?: number };
    const word = body.word?.trim().slice(0, 160);
    const provider = body.provider;
    const variation = Number.isFinite(body.variation) ? Number(body.variation) : 0;
    if (!word || !provider || !["openai", "gemini", "grok"].includes(provider)) {
      return Response.json({ error: "Invalid request" }, { status: 400, headers: corsHeaders });
    }

    const prompt = promptFor(word, variation);
    const seed = Math.abs([...`${word}-${variation}-${Date.now()}`].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) | 0, 7));
    if (provider === "grok") {
      const strokes = await grokStrokePlan(word, seed);
      return Response.json({ strokes, provider }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
    }
    const image = provider === "openai" ? await openAiImage(prompt) : await geminiImage(prompt);
    return Response.json({ image, provider }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 502, headers: corsHeaders }
    );
  }
});
