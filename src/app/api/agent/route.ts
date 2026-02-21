import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // allow up to 60s for slow models

interface AgentRequestBody {
  provider: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'cliproxyapi';
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  baseUrl?: string; // custom base URL for cliproxyapi
}

/* ------------------------------------------------------------------ */
/*  OpenRouter key info + retry helper                                */
/* ------------------------------------------------------------------ */

const OPENROUTER_RETRY_CODES = new Set([429, 500, 503]);

interface OpenRouterKeyData {
  label: string;
  limit: number | null;
  limit_remaining: number | null;
  usage: number;
  usage_daily: number;
  is_free_tier: boolean;
}

async function fetchOpenRouterKeyInfo(apiKey: string): Promise<OpenRouterKeyData | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as OpenRouterKeyData) ?? null;
  } catch {
    return null;
  }
}

async function callOpenRouterWithRetry(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxRetries = 3,
): Promise<string> {
  const baseUrl = 'https://openrouter.ai/api/v1';
  let lastErr = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.9,
        max_tokens: 4096,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    const errText = await res.text();
    lastErr = `HTTP ${res.status}: ${errText}`;
    console.warn(`[agent] OpenRouter attempt ${attempt}/${maxRetries} failed — ${lastErr}`);

    if (!OPENROUTER_RETRY_CODES.has(res.status)) {
      // Non-retryable (e.g. 400 bad request, 401 auth) — bail immediately
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }

    // Check key info to decide whether to retry
    const keyInfo = await fetchOpenRouterKeyInfo(apiKey);
    if (keyInfo) {
      console.log(
        `[agent] OpenRouter key info — label="${keyInfo.label}" limit=${keyInfo.limit} ` +
        `remaining=${keyInfo.limit_remaining} usage_daily=${keyInfo.usage_daily} ` +
        `free_tier=${keyInfo.is_free_tier}`,
      );

      // Only stop if there is a positive credit limit AND it is exhausted.
      // limit=0 or limit=null means free-tier / unlimited — always retry.
      const hasHardLimit = keyInfo.limit !== null && keyInfo.limit > 0;
      const creditsExhausted = hasHardLimit && (keyInfo.limit_remaining ?? 1) <= 0;
      if (creditsExhausted) {
        throw new Error(`OpenRouter out of credits (remaining=${keyInfo.limit_remaining}). Last error: ${lastErr}`);
      }
    }

    if (attempt < maxRetries) {
      const backoff = attempt * 2000; // 2s, 4s, …
      console.log(`[agent] OpenRouter retrying in ${backoff}ms…`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(`OpenRouter failed after ${maxRetries} attempts. Last error: ${lastErr}`);
}

/* ------------------------------------------------------------------ */
/*  Provider-specific callers                                          */
/* ------------------------------------------------------------------ */

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  extraHeaders?: Record<string, string>,
) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.9,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status} (${baseUrl}): ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(apiKey: string, model: string, system: string, user: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAnthropic(apiKey: string, model: string, system: string, user: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
      temperature: 0.9,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  let provider = '?';
  let model = '?';

  try {
    const body: AgentRequestBody = await request.json();
    ({ provider, model } = body);
    const { apiKey, systemPrompt, userPrompt } = body;

    console.log(`[agent] → ${provider}/${model}`);

    if (!provider || !model || !apiKey || !systemPrompt || !userPrompt) {
      const missing = ['provider','model','apiKey','systemPrompt','userPrompt']
        .filter((k) => !body[k as keyof AgentRequestBody]);
      console.error(`[agent] 400 missing fields: ${missing.join(', ')}`);
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let raw: string;
    switch (provider) {
      case 'openai':
        raw = await callOpenAICompatible('https://api.openai.com/v1', apiKey, model, systemPrompt, userPrompt);
        break;
      case 'openrouter':
        raw = await callOpenRouterWithRetry(apiKey, model, systemPrompt, userPrompt);
        break;
      case 'cliproxyapi': {
        const base = body.baseUrl || 'http://127.0.0.1:8317/v1';
        raw = await callOpenAICompatible(base, apiKey, model, systemPrompt, userPrompt);
        break;
      }
      case 'gemini':
        raw = await callGemini(apiKey, model, systemPrompt, userPrompt);
        break;
      case 'anthropic':
        raw = await callAnthropic(apiKey, model, systemPrompt, userPrompt);
        break;
      default:
        console.error(`[agent] 400 unknown provider: ${provider}`);
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    console.log(`[agent] ✓ ${provider}/${model} +${Date.now() - t0}ms raw=${raw.slice(0, 120).replace(/\n/g, ' ')}`);

    // Try to extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[agent] no JSON in response, returning raw text`);
      return NextResponse.json({ thought: '', speech: raw.trim(), action: '' });
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        thought: parsed.thought ?? '',
        speech: parsed.speech ?? '',
        action: parsed.action ?? '',
      });
    } catch (parseErr) {
      console.warn(`[agent] JSON parse failed: ${parseErr}, returning raw text`);
      return NextResponse.json({ thought: '', speech: raw.trim(), action: '' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] 500 ${provider}/${model} +${Date.now() - t0}ms — ${message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
