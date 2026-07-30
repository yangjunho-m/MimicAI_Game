const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export type AiProvider = "openai" | "gemini" | "cloudflare";

const providers: AiProvider[] = ["openai", "gemini", "cloudflare"];
const providerInk = ["#171717", "#168c73", "#f4a900"];

async function forceSinglePenStyle(source: string, aiIndex: number) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });

  const width = 720;
  const height = 500;
  const input = document.createElement("canvas");
  input.width = width;
  input.height = height;
  const inputContext = input.getContext("2d", { willReadFrequently: true })!;
  inputContext.fillStyle = "#fff";
  inputContext.fillRect(0, 0, width, height);
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  inputContext.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);

  const pixels = inputContext.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = Math.round(pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114);
  }

  const output = document.createElement("canvas");
  output.width = 900;
  output.height = 620;
  const outputContext = output.getContext("2d")!;
  outputContext.fillStyle = "#fff";
  outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.fillStyle = providerInk[aiIndex % providerInk.length];
  const isCloudflare = aiIndex % providers.length === 2;
  const samplingStep = isCloudflare ? 4 : 2;
  const contrastLimit = isCloudflare ? 72 : 54;

  // Convert every provider's raster output into one uneven, single-color pen.
  for (let y = 3; y < height - 3; y += samplingStep) {
    for (let x = 3; x < width - 3; x += samplingStep) {
      const warpedX = isCloudflare
        ? Math.max(2, Math.min(width - 3, Math.round(x + Math.sin(y * 0.055) * 7 + Math.sin(y * 0.013) * 5)))
        : x;
      const warpedY = isCloudflare
        ? Math.max(2, Math.min(height - 3, Math.round(y + Math.sin(x * 0.047) * 5)))
        : y;
      const center = warpedY * width + warpedX;
      const horizontal = Math.abs(gray[center + 1] - gray[center - 1]);
      const vertical = Math.abs(gray[center + width] - gray[center - width]);
      const contrast = horizontal + vertical;
      const noise = Math.abs((x * 37 + y * 53 + aiIndex * 97) % 100);
      if (contrast > contrastLimit && gray[center] < 248 && (!isCloudflare || noise > 27)) {
        const jitterRange = isCloudflare ? 13 : 3;
        const jitterX = ((x * 17 + y * 7 + aiIndex * 11) % jitterRange) - Math.floor(jitterRange / 2);
        const jitterY = ((x * 5 + y * 13 + aiIndex * 19) % jitterRange) - Math.floor(jitterRange / 2);
        const targetX = Math.round((x / width) * output.width + jitterX);
        const targetY = Math.round((y / height) * output.height + jitterY);
        outputContext.fillRect(
          targetX,
          targetY,
          isCloudflare ? 5 + (noise % 3) : 3 + ((x + y) % 2),
          isCloudflare ? 3 + (noise % 2) : 3
        );
        if (isCloudflare && noise > 91) {
          outputContext.fillRect(targetX + 5, targetY - 4, 8, 3);
        }
      }
    }
  }

  return output.toDataURL("image/png");
}

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
  return { image: await forceSinglePenStyle(data.image, aiIndex), provider };
}
