# OpenRouter for a browser-only PWA (verified 2026-10-18)

Model IDs and prices below come from `GET https://openrouter.ai/api/v1/models` (pulled 2026-10-18). Prices are USD per 1M tokens.

## 1. Handwritten page images to Markdown + LaTeX

| Role | Model id | In / Out | `image` field | Context |
|---|---|---|---|---|
| **Primary (cheap, fast)** | `google/gemini-3.1-flash-lite` (GA) | $0.25 / $1.50 | 0.00000025 | 1,048,576 |
| **Stronger alternative** | `google/gemini-3.8-flash` | $0.825 / $4.125 | 0.000000825 | 1,048,576 |

- Both accept `text, image, file, audio, video` input and support `structured_outputs`. Reasoning tokens are billed at the output rate (`internal_reasoning`), so keep `reasoning` low for transcription.
- The docs define `pricing.image` as "cost per image input" (https://openrouter.ai/docs/guides/overview/models). Images are also billed as input tokens.
- Cheaper fallback: `anthropic/claude-haiku-5.5` at $0.10 / $0.50, 1M context, image+file input. Price rises to $0.50 / $2.50 above 100k prompt tokens.
- Gemini as primary is a judgment call, not a benchmark. Test on real pages.

## 2. Cheap structured JSON (quizzes, study guides)

- **`anthropic/claude-haiku-5.5`**: $0.10 / $0.50, 1,000,000 context. `supported_parameters` includes `structured_outputs` and `response_format`.
- Alternative: **`openai/gpt-5.6-luna`**: $0.20 / $1.20, 1,050,000 context, also has `structured_outputs`. Price rises to $0.40 / $1.80 above 272k tokens.
- Request shape: `response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}`. Support depends on the endpoint (provider), not just the model. Add `provider: {require_parameters: true}` so requests only go to providers that support it. (https://openrouter.ai/docs/guides/features/structured-outputs).

## 3. Web search

- **Current:** add `tools: [{type:"openrouter:web_search", parameters:{engine, max_results, max_total_results, allowed_domains, ...}}]`. The model decides whether and how often to search (0 to N times). This is labeled **Beta** (https://openrouter.ai/docs/guides/features/server-tools/web-search).
- **Deprecated:** `plugins:[{id:"web"}]` and the `:online` suffix. They still work and always search exactly once per request (https://openrouter.ai/docs/guides/features/plugins/web-search).
- **Citations** come back in `choices[0].message.annotations[]` as `{type:"url_citation", url_citation:{url,title,content,start_index,end_index}}`. The search count is in `usage.server_tool_use.web_search_requests`.
- **Pricing** (on top of tokens):
  - Exa (the default when native search isn't available): $0.007 per request, up to 10 results included, then $0.001 per extra result.
  - Parallel: $0.001 to $0.005 per request.
  - Perplexity: $0.005 per request.
  - Firecrawl: $0.005 per search plus $0.0125 per result.
  - Native search is passed through from the provider. The models API `pricing.web_search` field gives Gemini at $0.014 and Anthropic/OpenAI at $0.01 per search.

## 4. CORS, headers, images, PDFs

- **CORS works.** I tested this live: `OPTIONS /api/v1/chat/completions` returned 204 with `access-control-allow-origin: *`. The allowed headers include `Authorization, Content-Type, HTTP-Referer, X-OpenRouter-Title, X-Title, X-OpenRouter-Categories`. GET `/models` and `/key` also return ACAO `*`.
- **Attribution headers:** `HTTP-Referer` (your app URL) is required for attribution. `X-OpenRouter-Title` is preferred, and `X-Title` is still accepted (https://openrouter.ai/docs/app-attribution).
- **Images:** send `{type:"image_url", image_url:{url:"data:image/jpeg;base64,..."}}`. Put the text part first. Supported formats are png, jpeg, webp and gif (https://openrouter.ai/docs/guides/overview/multimodal/image-understanding).
- **PDFs:** send `{type:"file", file:{filename:"x.pdf", file_data:"data:application/pdf;base64,..."}}`. This works with any model (https://openrouter.ai/docs/guides/overview/multimodal/pdfs). Choose the engine with `plugins:[{id:"file-parser", pdf:{engine}}]`:
  - `native`: billed as input tokens, and the default for models with file input, such as the Gemini models above.
  - `mistral-ocr`: $2 per 1,000 pages, the default otherwise. It forwards at most 8 images per PDF.
  - `cloudflare-ai`: free, but text-only, so it's poor for handwriting.
  - **Simplest path:** send the PDF to `google/gemini-3.1-flash-lite` with the native engine, and skip rasterizing pages in the browser.

## 5. Key validation / credit

- `GET https://openrouter.ai/api/v1/key` with `Authorization: Bearer <key>` (https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) returns `{data:{label, limit, limit_remaining, limit_reset, usage, usage_daily, usage_weekly, usage_monthly, byok_usage*, is_free_tier, is_management_key, expires_at, rate_limit, free_model_daily_requests, budgets[], effective_budget, ...}}`.
- `limit` and `limit_remaining` describe the per-key cap only, and are `null` when the key has no cap.
- An invalid key returns 401 `{"error":{"message":"User not found.","code":401}}`. Tested live; the legacy `/api/v1/auth/key` still responds the same way.
- The **account balance** (`GET /api/v1/credits`) needs a **management key**, so a pasted normal key can't read it. A 402 error means credit has run out (https://openrouter.ai/docs/api_reference/limits).
