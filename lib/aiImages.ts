const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export type AiProvider = "openai" | "gemini" | "cloudflare";

const providers: AiProvider[] = ["openai", "gemini", "cloudflare"];
const providerInk = ["#171717", "#168c73", "#171717"];

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

  if (isCloudflare) {
    const candidates: Array<{ x: number; y: number; used: boolean }> = [];
    for (let y = 3; y < height - 3; y += 3) {
      for (let x = 3; x < width - 3; x += 3) {
        const center = y * width + x;
        const contrast = Math.abs(gray[center + 1] - gray[center - 1])
          + Math.abs(gray[center + width] - gray[center - width]);
        if (contrast > 64 && gray[center] < 248) candidates.push({ x, y, used: false });
      }
    }

    const strokeCount = Math.min(15, Math.max(5, 5 + (candidates.length % 11)));
    outputContext.strokeStyle = "#171717";
    outputContext.lineWidth = 5;
    outputContext.lineCap = "round";
    outputContext.lineJoin = "round";

    for (let stroke = 0; stroke < strokeCount && candidates.length; stroke += 1) {
      let current = candidates[(stroke * 977 + candidates.length * 13) % candidates.length];
      let attempts = 0;
      while (current.used && attempts < candidates.length) {
        current = candidates[(stroke * 977 + attempts * 37) % candidates.length];
        attempts += 1;
      }
      if (current.used) break;

      outputContext.beginPath();
      const startX = (current.x / width) * output.width;
      const startY = (current.y / height) * output.height;
      outputContext.moveTo(startX - 7 + (stroke % 4), startY + 5 - (stroke % 3));

      for (let point = 0; point < 65; point += 1) {
        current.used = true;
        const near = candidates
          .filter(candidate => !candidate.used && Math.abs(candidate.x - current.x) < 22 && Math.abs(candidate.y - current.y) < 22)
          .sort((a, b) => {
            const distanceA = (a.x - current.x) ** 2 + (a.y - current.y) ** 2;
            const distanceB = (b.x - current.x) ** 2 + (b.y - current.y) ** 2;
            return distanceA - distanceB;
          })[0];
        if (!near) break;
        current = near;
        const wobbleX = Math.sin(point * 1.71 + stroke * 2.3) * 6;
        const wobbleY = Math.cos(point * 1.37 + stroke * 1.9) * 5;
        outputContext.lineTo(
          (current.x / width) * output.width + wobbleX,
          (current.y / height) * output.height + wobbleY
        );
      }
      outputContext.stroke();
    }
    return output.toDataURL("image/png");
  }

  // Convert every provider's raster output into one uneven, single-color pen.
  for (let y = 3; y < height - 3; y += 2) {
    for (let x = 3; x < width - 3; x += 2) {
      const center = y * width + x;
      const horizontal = Math.abs(gray[center + 1] - gray[center - 1]);
      const vertical = Math.abs(gray[center + width] - gray[center - width]);
      const contrast = horizontal + vertical;
      const noise = Math.abs((x * 37 + y * 53 + aiIndex * 97) % 100);
      if (contrast > 54 && gray[center] < 248) {
        const jitterRange = 3;
        const jitterX = ((x * 17 + y * 7 + aiIndex * 11) % jitterRange) - Math.floor(jitterRange / 2);
        const jitterY = ((x * 5 + y * 13 + aiIndex * 19) % jitterRange) - Math.floor(jitterRange / 2);
        const targetX = Math.round((x / width) * output.width + jitterX);
        const targetY = Math.round((y / height) * output.height + jitterY);
        outputContext.fillRect(
          targetX,
          targetY,
          3 + ((x + y) % 2),
          3
        );
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
