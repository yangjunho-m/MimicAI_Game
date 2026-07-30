import { NextRequest, NextResponse } from "next/server";
export const runtime = "edge";

export async function POST(request: NextRequest) {
  const { word } = await request.json();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ fallback: true }, { status: 503 });
  const prompt = [`Draw "${String(word).slice(0, 80)}".`, "A playful imperfect hand-drawn doodle made only with round pen strokes.", "Pure white background. No texture, shading, gradients, text, border, photo realism, pencil, or filled areas.", "Use black plus at most one accent color. Vary stroke thickness slightly.", "Centered composition, charming amateur web canvas drawing."].join(" ");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1024", quality: "low", output_format: "png" }),
  });
  if (!response.ok) { console.error("OpenAI image generation failed", response.status); return NextResponse.json({ error: "generation_failed" }, { status: 502 }); }
  const result = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const image = result.data?.[0]?.b64_json ? `data:image/png;base64,${result.data[0].b64_json}` : result.data?.[0]?.url;
  if (!image) return NextResponse.json({ error: "empty_image" }, { status: 502 });
  return NextResponse.json({ image, fallback: false });
}
