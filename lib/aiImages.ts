const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export type AiProvider = "openai" | "gemini" | "cloudflare";

const providers: AiProvider[] = ["openai", "gemini", "cloudflare"];

export async function generateAiImage(word: string, aiIndex: number) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase is not configured");

  const provider = providers[aiIndex % providers.length];
  const response = await fetch(`${supabaseUrl}/functions/v1/generate-ai`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ word, provider, variation: aiIndex })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${provider}: ${response.status} ${message}`);
  }

  const data = await response.json() as { image?: string; provider?: AiProvider };
  if (!data.image?.startsWith("data:image/")) throw new Error(`${provider}: invalid image`);
  return { image: data.image, provider };
}
