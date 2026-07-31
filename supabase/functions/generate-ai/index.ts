const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Provider = "openai" | "gemini" | "fal";

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

async function imageUrlToDataUri(url: string, mimeHint = "image/png") {
  if (url.startsWith("data:image/")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fal image download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${response.headers.get("content-type") || mimeHint};base64,${btoa(binary)}`;
}

async function falImage(prompt: string, seed: number) {
  const key = Deno.env.get("FAL_API_KEY");
  if (!key) throw new Error("FAL_API_KEY is missing");
  const response = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_size: "square",
      num_inference_steps: 20,
      guidance_scale: 4.5,
      seed,
      sync_mode: true,
      num_images: 1,
      enable_safety_checker: true,
      output_format: "png",
      acceleration: "regular"
    })
  });
  const data = await response.json();
  const image = data?.images?.[0];
  if (!response.ok || !image?.url) {
    const detail = data?.detail || data?.error?.message || data?.error || JSON.stringify(data);
    throw new Error(`fal.ai ${response.status}: ${detail}`);
  }
  return imageUrlToDataUri(image.url, image.content_type || "image/png");
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
    if (!word || !provider || !["openai", "gemini", "fal"].includes(provider)) {
      return Response.json({ error: "Invalid request" }, { status: 400, headers: corsHeaders });
    }

    const prompt = promptFor(word, variation);
    const seed = Math.abs([...`${word}-${variation}-${Date.now()}`].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) | 0, 7));
    const image = provider === "openai"
      ? await openAiImage(prompt)
      : provider === "gemini"
        ? await geminiImage(prompt)
        : await falImage(prompt, seed);
    return Response.json({ image, provider }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 502, headers: corsHeaders }
    );
  }
});
