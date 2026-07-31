const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export type AiProvider = "openai" | "gemini" | "grok";

const providers: AiProvider[] = ["openai", "gemini", "grok"];
const providerInk = ["#171717", "#168c73", "#171717"];

type StrokePlan = Array<Array<[number, number]>>;

function renderStrokePlan(strokes: StrokePlan, aiIndex: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 620;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#171717";
  context.lineWidth = 7;
  context.lineCap = "round";
  context.lineJoin = "round";

  strokes.slice(0, 15).forEach((stroke, strokeIndex) => {
    const points = stroke.slice(0, 24);
    if (points.length < 2) return;
    context.beginPath();
    points.forEach(([rawX, rawY], pointIndex) => {
      const x = Math.max(7, Math.min(93, Number(rawX))) / 100 * canvas.width;
      const y = Math.max(8, Math.min(92, Number(rawY))) / 100 * canvas.height;
      const wobbleX = Math.sin(pointIndex * 1.8 + strokeIndex * 2.1 + aiIndex) * 5;
      const wobbleY = Math.cos(pointIndex * 1.45 + strokeIndex * 1.7 + aiIndex) * 4;
      if (pointIndex === 0) context.moveTo(x - 5, y + 3);
      else context.lineTo(x + wobbleX, y + wobbleY);
    });
    context.stroke();
  });

  return canvas.toDataURL("image/png");
}

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

  const data = await response.json() as { image?: string; strokes?: StrokePlan; provider?: AiProvider };
  if (provider === "grok" && Array.isArray(data.strokes) && data.strokes.length >= 5) {
    return { image: renderStrokePlan(data.strokes, aiIndex), provider };
  }
  if (!data.image?.startsWith("data:image/")) throw new Error(`${provider}: invalid image`);
  return { image: await forceSinglePenStyle(data.image, aiIndex), provider };
}
