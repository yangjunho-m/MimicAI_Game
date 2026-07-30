const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Provider = "openai" | "gemini" | "cloudflare";

const stylePrompts = [
  "Use loose black ink with uneven pressure and several hesitant corrections.",
  "Use a colored felt-tip pen with wobbly outlines, imperfect proportions, and a few overlapping strokes.",
  "Use a thick dark marker with crooked geometry, broken curves, and casual human line variation."
];

function promptFor(word: string, variation: number) {
  return [
    `Draw this subject: ${word}.`,
    "Make it look like a quick drawing made by a person using a mouse in a simple web paint program.",
    "Pure white background. Pen strokes only. No shading, gradients, textures, realistic lighting, typography, border, frame, or signature.",
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

async function cloudflareImage(prompt: string, seed: number) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !accountId) throw new Error("Cloudflare secrets are missing");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, seed, steps: 6 })
    }
  );
  const data = await response.json();
  if (!response.ok || !data?.result?.image) {
    throw new Error(data?.errors?.[0]?.message || `Cloudflare ${response.status}`);
  }
  return `data:image/jpeg;base64,${data.result.image}`;
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
    if (!word || !provider || !["openai", "gemini", "cloudflare"].includes(provider)) {
      return Response.json({ error: "Invalid request" }, { status: 400, headers: corsHeaders });
    }

    const prompt = promptFor(word, variation);
    const seed = Math.abs([...`${word}-${variation}-${Date.now()}`].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) | 0, 7));
    const image = provider === "openai"
      ? await openAiImage(prompt)
      : provider === "gemini"
        ? await geminiImage(prompt)
        : await cloudflareImage(prompt, seed);

    return Response.json({ image, provider }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 502, headers: corsHeaders }
    );
  }
});
