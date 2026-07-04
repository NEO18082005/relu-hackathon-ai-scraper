export const runtime = 'edge';

interface OpenRouterModel {
  id: string;
  name: string;
}

const CURATED_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat-v3-0324',
  'qwen/qwen3-235b-a22b',
  'mistralai/mistral-large-2411',
];

function defaultModels() {
  return CURATED_MODELS.map(id => ({
    id,
    name: id.split('/').pop()?.replace(/-/g, ' ') || id,
  }));
}

export async function POST(request: Request) {
  try {
    const { openrouterKey } = await request.json();

    if (!openrouterKey) {
      return Response.json({ models: defaultModels() });
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
      },
    });

    if (!response.ok) {
      return Response.json({ models: defaultModels() });
    }

    const data = await response.json();
    const allModels: OpenRouterModel[] = data.data || [];

    const curatedSet = new Set(CURATED_MODELS);
    const textModels = allModels
      .filter(m => m.id && !m.id.includes('image') && !m.id.includes('vision-only') && !m.id.includes('tts'))
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        curated: curatedSet.has(m.id),
      }))
      .sort((a, b) => {
        if (a.curated && !b.curated) return -1;
        if (!a.curated && b.curated) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 50);

    return Response.json({ models: textModels });
  } catch {
    return Response.json({ models: defaultModels() });
  }
}
