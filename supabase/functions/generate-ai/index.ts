const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Provider = "openai" | "gemini" | "cloudflare";

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

async function translateSceneForCloudflare(word: string) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !accountId) throw new Error("Cloudflare secrets are missing");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "Translate the Korean drawing topic into one concise concrete English visual scene. Return English only. Never copy Korean text. Never mention typography, labels, signs, writing, pens, pencils, paper, or art tools."
          },
          { role: "user", content: word }
        ],
        max_tokens: 100
      })
    }
  );
  const data = await response.json();
  const translated = data?.result?.response?.trim();
  if (!response.ok || !translated) throw new Error(data?.errors?.[0]?.message || `Cloudflare translation ${response.status}`);
  return translated.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, "").trim();
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

async function cloudflareStrokePlan(subject: string, seed: number) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  if (!token || !accountId) throw new Error("Cloudflare secrets are missing");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You design crude mouse drawings as JSON polylines. Canvas coordinates are 0 to 100. Return ONLY a JSON array containing 5 to 15 strokes. Each stroke is an array of 2 to 14 [x,y] points. Make the subject recognizable using large silhouettes and essential parts only. Use awkward proportions, shaky bends, a few overshoots, and no facial expression. Do not add a frame, ground decorations, repeated symbols, text, dots, shading, or tiny details. Keep all points between 8 and 92. Random seed: ${seed}.`
          },
          { role: "user", content: `Create a badly drawn but recognizable line drawing of: ${subject}` }
        ],
        max_tokens: 900,
        temperature: 0.85
      })
    }
  );
  const data = await response.json();
  const text = data?.result?.response || "";
  if (!response.ok || !text) throw new Error(data?.errors?.[0]?.message || `Cloudflare ${response.status}`);
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("Cloudflare returned no stroke plan");
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Cloudflare returned an invalid stroke plan");
  const strokes = parsed
    .slice(0, 15)
    .map((stroke: unknown) => Array.isArray(stroke)
      ? stroke.slice(0, 14).filter(point => Array.isArray(point) && point.length >= 2).map(point => [
        Math.max(8, Math.min(92, Number(point[0]))),
        Math.max(8, Math.min(92, Number(point[1])))
      ])
      : [])
    .filter((stroke: number[][]) => stroke.length >= 2);
  if (strokes.length < 5) throw new Error("Cloudflare returned too few strokes");
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
    if (!word || !provider || !["openai", "gemini", "cloudflare"].includes(provider)) {
      return Response.json({ error: "Invalid request" }, { status: 400, headers: corsHeaders });
    }

    const visualSubject = provider === "cloudflare" ? await translateSceneForCloudflare(word) : word;
    const prompt = promptFor(visualSubject, variation);
    const seed = Math.abs([...`${word}-${variation}-${Date.now()}`].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) | 0, 7));
    if (provider === "cloudflare") {
      const strokes = await cloudflareStrokePlan(visualSubject, seed);
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
