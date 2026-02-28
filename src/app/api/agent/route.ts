import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // allow up to 60s for slow models

// Server-side only - get API key from environment
function getApiKey(provider: string): string {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY || '';
    case 'gemini':
      return process.env.GEMINI_API_KEY || '';
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || '';
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY || '';
    case 'cliproxyapi':
      return process.env.CLIPROXYAPI_API_KEY || '';
    default:
      return '';
  }
}

// Get default provider and model from environment
function getDefaultConfig(): { provider: string; model: string; baseUrl: string } {
  return {
    provider: process.env.LLM_PROVIDER || 'openrouter',
    model: process.env.LLM_MODEL || 'google/gemini-2.0-flash-exp:free',
    baseUrl: process.env.CLIPROXYAPI_BASE_URL || 'http://127.0.0.1:8317/v1',
  };
}

interface AgentRequestBody {
  provider?: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'cliproxyapi';
  model?: string;
  systemPrompt: string;
  userPrompt: string;
}

interface ParsedAgentPayload {
  thought?: string;
  speech?: string;
  action?: string;
  expression?: string;
  raiseAmount?: number;
}

/* ------------------------------------------------------------------ */
/*  OpenRouter key info + retry helper                                */
/* ------------------------------------------------------------------ */

const OPENROUTER_RETRY_CODES = new Set([429, 500, 503, 524]);

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
  maxRetries = 10,
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
  const defaults = getDefaultConfig();
  let provider: string = defaults.provider;
  let model: string = defaults.model;

  try {
    const body: AgentRequestBody = await request.json();
    
    // Use provided values or fall back to defaults
    provider = body.provider || defaults.provider;
    model = body.model || defaults.model;
    const { systemPrompt, userPrompt } = body;
    
    // Get API key from environment (never from client)
    const apiKey = getApiKey(provider);

    console.log(`[agent] → ${provider}/${model}`);

    if (!systemPrompt || !userPrompt) {
      console.error(`[agent] 400 missing prompts`);
      return NextResponse.json({ error: 'Missing required fields: systemPrompt, userPrompt' }, { status: 400 });
    }

    if (!apiKey) {
      console.error(`[agent] 400 no API key configured for provider: ${provider}`);
      return NextResponse.json({ error: `No API key configured for provider: ${provider}` }, { status: 400 });
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
        const base = defaults.baseUrl;
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

    console.log(`[agent] ✓ ${provider}/${model} +${Date.now() - t0}ms raw=${raw.slice(0, 200).replace(/\n/g, ' ')}`);

    // Try to extract JSON from response
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[agent] no JSON in response, returning raw text`);
      return NextResponse.json({ thought: '', speech: normalized, action: '', expression: '🤔' });
    }

    // Helper: attempt to repair common JSON issues
    const repairJSON = (jsonStr: string): string => {
      let working = jsonStr.trim();
      
      // Step 1: Handle nested JSON - if "speech" contains a JSON object, extract it
      const nestedMatch = working.match(/"speech":\s*"(\{[^}]*\})"/);
      if (nestedMatch) {
        const inner = nestedMatch[1];
        if (inner.includes('"thought"') || inner.includes('"action"')) {
          working = inner;
        }
      }
      
      // Step 2: Fix unescaped newlines - replace literal newlines between quotes with \n
      // Use a state machine to track if we're inside a string value
      const chars = working.split('');
      const result: string[] = [];
      let inString = false;
      let afterColon = false;
      let escapeNext = false;
      
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        const prev = i > 0 ? chars[i - 1] : '';
        
        if (escapeNext) {
          result.push(char);
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          result.push(char);
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && prev !== '\\') {
          result.push(char);
          if (afterColon) {
            inString = !inString;
            if (!inString) afterColon = false;
          } else {
            inString = !inString;
          }
          continue;
        }
        
        if (char === ':' && !inString) {
          result.push(char);
          afterColon = true;
          continue;
        }
        
        // Replace control characters when inside string values
        if (inString && afterColon) {
          if (char === '\n') {
            result.push('\\n');
          } else if (char === '\r') {
            result.push('\\r');
          } else if (char === '\t') {
            result.push('\\t');
          } else if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) {
            // Skip other control characters
            continue;
          } else {
            result.push(char);
          }
        } else {
          result.push(char);
        }
      }
      
      working = result.join('');
      
      // Step 3: Fix missing commas between properties
      working = working.replace(/"\s+"([a-zA-Z_]+)":/g, '", "$1":');
      working = working.replace(/([}\]])\s+"([a-zA-Z_]+)":/g, '$1, "$2":');
      working = working.replace(/([0-9])\s+"([a-zA-Z_]+)":/g, '$1, "$2":');
      
      // Step 4: Parse and keep only valid fields
      try {
        const parsed = JSON.parse(working);
        const validFields = ['thought', 'speech', 'action', 'expression', 'raiseAmount'];
        const cleaned: Record<string, unknown> = {};
        for (const field of validFields) {
          if (field in parsed) {
            cleaned[field] = parsed[field];
          }
        }
        return JSON.stringify(cleaned);
      } catch {
        return working;
      }
    };

    let jsonStr = jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr) as ParsedAgentPayload;
      return NextResponse.json({
        thought: typeof parsed.thought === 'string' ? parsed.thought : '',
        speech: typeof parsed.speech === 'string' ? parsed.speech : '',
        action: typeof parsed.action === 'string' ? parsed.action : '',
        expression: typeof parsed.expression === 'string' ? parsed.expression : '🤔',
        raiseAmount: typeof parsed.raiseAmount === 'number' ? parsed.raiseAmount : 0,
      });
    } catch (parseErr) {
      // Try repairing the JSON
      console.warn(`[agent] JSON parse failed: ${parseErr}, attempting repair`);
      try {
        const repairedStr = repairJSON(jsonStr);
        console.log(`[agent] repaired JSON attempt: ${repairedStr.slice(0, 300)}`);
        const parsed = JSON.parse(repairedStr) as ParsedAgentPayload;
        return NextResponse.json({
          thought: typeof parsed.thought === 'string' ? parsed.thought : '',
          speech: typeof parsed.speech === 'string' ? parsed.speech : '',
          action: typeof parsed.action === 'string' ? parsed.action : '',
          expression: typeof parsed.expression === 'string' ? parsed.expression : '🤔',
          raiseAmount: typeof parsed.raiseAmount === 'number' ? parsed.raiseAmount : 0,
        });
      } catch (repairErr) {
        console.warn(`[agent] JSON repair failed: ${repairErr}, returning raw text`);
        return NextResponse.json({ thought: '', speech: normalized, action: '', expression: '🤔', raiseAmount: 0 });
      }
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
