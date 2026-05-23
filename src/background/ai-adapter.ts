import type { ChatParams, ChatResult } from '../shared/types';

export async function chat(params: ChatParams): Promise<ChatResult> {
  const { baseUrl, apiKey, model, messages, temperature = 0.3 } = params;
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${text || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage
    ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
    : undefined;

  return { content, usage };
}
