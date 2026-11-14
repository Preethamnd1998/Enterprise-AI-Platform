// client.js — minimal client for the official Gemini API (Generative Language REST, v1beta
// generateContent). No SDK: Node 20's fetch is enough and keeps the platform dependency-free.
// Contract: generate() NEVER throws; it resolves to { ok:true, data, usage, model } or
// { ok:false, code, reason } and the API key never appears in either.
import { validateBaseUrl, DEFAULT_BASE_URL, DEFAULT_MODEL } from "../../../core/gemini/index.js";

export const RETRY_DELAYS_MS = [1000, 3000];

// Gemini responseSchema uses the OpenAPI subset with upper-case type names.
export const S = {
  str: (description) => ({ type: "STRING", ...(description ? { description } : {}) }),
  int: () => ({ type: "INTEGER" }),
  arr: (items) => ({ type: "ARRAY", items }),
  obj: (properties, required) => ({ type: "OBJECT", properties, required: required ?? Object.keys(properties) }),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ key, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch, timeoutMs = 120000, maxOutputTokens = 8192, retryDelays = RETRY_DELAYS_MS } = {}) {
  const scrub = (s) => (key ? String(s).split(key).join("***") : String(s));

  async function generate({ system, prompt, schema, maxTokens = maxOutputTokens, temperature = 0.2 }) {
    if (!key) return { ok: false, code: "NO_KEY", reason: "no Gemini API key configured (GEMINI_API_KEY / GOOGLE_API_KEY)" };
    let url;
    try { url = `${validateBaseUrl(baseUrl)}/v1beta/models/${encodeURIComponent(model)}:generateContent`; } catch (e) { return { ok: false, code: "CONFIG", reason: e.message }; }
    const body = JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: "application/json", ...(schema ? { responseSchema: schema } : {}) },
    });

    let last = { ok: false, code: "UNAVAILABLE", reason: "no attempt made" };
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body, signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return parseSuccess(await res.json(), model, scrub);
        const status = res.status;
        let msg = "";
        try { msg = (await res.json())?.error?.message ?? ""; } catch { /* non-JSON error body */ }
        if (status === 429 || status >= 500) {
          last = { ok: false, code: status === 429 ? "QUOTA" : "UNAVAILABLE", reason: `Gemini API ${status === 429 ? "rate limit / quota reached" : `server error ${status}`}` };
          if (attempt < retryDelays.length) { await sleep(retryDelays[attempt]); continue; }
          return last;
        }
        if (status === 404) {
          const hint = /use models\/([A-Za-z0-9._-]+)/.exec(msg)?.[1];
          return { ok: false, code: "MODEL", reason: `model "${model}" is not available to your key${hint ? ` (Google suggests ${hint})` : ""} — set GEMINI_MODEL or re-run gemini:setup --check` };
        }
        if (status === 400 && /api key/i.test(msg)) return { ok: false, code: "AUTH", reason: "the Gemini API rejected the key" };
        if (status === 401 || status === 403) return { ok: false, code: "AUTH", reason: "the Gemini API rejected the key or the key lacks access" };
        return { ok: false, code: "BAD_REQUEST", reason: scrub(`Gemini API ${status}: ${msg}`.slice(0, 300)) };
      } catch (e) {
        const timedOut = e.name === "TimeoutError" || e.name === "AbortError";
        last = { ok: false, code: "NETWORK", reason: scrub(`${timedOut ? `request timed out after ${Math.round(timeoutMs / 1000)}s (the Gemini service is slow or busy; raise GEMINI_TIMEOUT_MS if inputs are large)` : `network error: ${e.message ?? e}`}`.slice(0, 240)) };
        // a timeout is not retried: the request may still be running upstream and a retry would only double the wait
        if (!timedOut && attempt < retryDelays.length) { await sleep(retryDelays[attempt]); continue; }
        return last;
      }
    }
    return last;
  }
  return { generate, model };
}

function parseSuccess(json, model, scrub) {
  const block = json?.promptFeedback?.blockReason;
  if (block) return { ok: false, code: "BLOCKED", reason: `Gemini declined the request (${block})` };
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) return { ok: false, code: "BAD_RESPONSE", reason: `empty response${cand?.finishReason ? ` (${cand.finishReason})` : ""}` };
  const usage = { input: json?.usageMetadata?.promptTokenCount ?? null, output: json?.usageMetadata?.candidatesTokenCount ?? null };
  try {
    return { ok: true, data: JSON.parse(text), usage, model };
  } catch {
    const why = cand?.finishReason === "MAX_TOKENS" ? "output was cut off — narrow the input or raise GEMINI_MAX_OUTPUT_TOKENS" : "response was not valid JSON";
    return { ok: false, code: "BAD_RESPONSE", reason: scrub(why) };
  }
}
