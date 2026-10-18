// The live check (npm run live-check) against faked OpenRouter: everything up
// to the network is real (Model Gateway, Prompt Builder, the Quiz Maker's
// schema). Only the quality of real model output is left to the manual run.
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { KEY_VARIABLE, requireKey } from '../live-check/key'
import { runLiveCheck, type Sample } from '../live-check/liveCheck'
import { OPENROUTER, chatCompletion, openRouter, openRouterRequests, server } from './harness/openRouter'

const spanishPdf: Sample = {
  name: 'fotosintesis.pdf',
  language: 'es',
  original: { mime: 'application/pdf', bytes: new TextEncoder().encode('%PDF- page es') },
}
const englishPhoto: Sample = {
  name: 'pythagoras.jpg',
  language: 'en',
  original: { mime: 'image/jpeg', bytes: new TextEncoder().encode('jpeg bytes en') },
}

/** Runs the live check on both samples and returns everything it printed. */
async function liveCheck() {
  const lines: string[] = []
  const result = await runLiveCheck({
    key: 'sk-or-v1-live',
    samples: [spanishPdf, englishPhoto],
    print: (line) => lines.push(line),
  })
  return { ...result, output: lines.join('\n') }
}

describe('the OpenRouter key for the live check', () => {
  it('fails fast with a message naming the variable when it is missing', () => {
    expect(() => requireKey({})).toThrow(KEY_VARIABLE)
    expect(() => requireKey({ [KEY_VARIABLE]: '  ' })).toThrow(/OPENROUTER_API_KEY=sk-or-/)
  })

  it('comes from the environment', () => {
    expect(requireKey({ OPENROUTER_API_KEY: ' sk-or-v1-test \n' })).toBe('sk-or-v1-test')
  })
})

describe('the live check', () => {
  it('reads each sample Page with the real Gateway and prints its Recognized Text', async () => {
    server.use(
      openRouter.readPage.as(({ mime }) =>
        mime === 'application/pdf' ? '# La fotosíntesis\n$6CO_2$' : '# The Pythagorean Theorem',
      ),
      openRouter.practiceQuiz.questions([]),
    )

    const { output } = await liveCheck()

    expect(output).toContain('fotosintesis.pdf')
    expect(output).toContain('# La fotosíntesis\n$6CO_2$')
    expect(output).toContain('pythagoras.jpg')
    expect(output).toContain('# The Pythagorean Theorem')
    const reads = openRouterRequests.filter((request) => request.url.endsWith('/chat/completions'))
    expect(reads[0].headers.get('Authorization')).toBe('Bearer sk-or-v1-live')
  })

  it('makes a 5-Question Practice Quiz from each Page in its Language and prints the correct answers', async () => {
    server.use(
      openRouter.readPage.as(({ mime }) => (mime === 'application/pdf' ? 'Notas en español' : 'Notes in English')),
      openRouter.practiceQuiz.questions([
        {
          prompt: '¿Dónde ocurre la fotosíntesis?',
          options: ['En las mitocondrias', 'En los cloroplastos', 'En la raíz', 'En los estomas'],
          correctIndex: 1,
          explanation: 'Ocurre en los cloroplastos, que tienen clorofila.',
          sourceMaterialId: '1',
        },
      ]),
    )

    const { output } = await liveCheck()

    expect(output).toContain('Practice Quiz in Spanish (5 Questions) from fotosintesis.pdf')
    expect(output).toContain('Practice Quiz in English (5 Questions) from pythagoras.jpg')
    expect(output).toContain('1. ¿Dónde ocurre la fotosíntesis?')
    expect(output).toContain('   a) En las mitocondrias')
    expect(output).toContain(' * b) En los cloroplastos   <- correct')
    expect(output).toContain('Why: Ocurre en los cloroplastos, que tienen clorofila.')
    expect(output).toContain('Only 1 of 5 Questions came back usable')
    const quizPrompts = await Promise.all(
      openRouterRequests.map(async (request) => (await request.clone().json()) as { response_format?: unknown; messages: { content: unknown }[] }),
    ).then((bodies) => bodies.filter((body) => body.response_format).map((body) => String(body.messages[0].content)))
    expect(quizPrompts).toHaveLength(2)
    expect(quizPrompts[0]).toContain('Spanish')
    expect(quizPrompts[0]).toContain('Notas en español')
    expect(quizPrompts[1]).toContain('English')
    expect(quizPrompts[1]).toContain('Notes in English')
  })

  it('prints the token usage and cost of every call, and the totals', async () => {
    const reply = (content: string, model: string, usage: Record<string, unknown>) =>
      HttpResponse.json({ ...chatCompletion(content), model, provider: 'Test Provider', usage })
    server.use(
      http.post(`${OPENROUTER}/chat/completions`, async ({ request }) => {
        const body = (await request.clone().json()) as { response_format?: unknown }
        return body.response_format
          ? reply(JSON.stringify({ questions: [] }), 'anthropic/claude-haiku-5.5', {
              prompt_tokens: 2000,
              completion_tokens: 600,
              total_tokens: 2600,
              cost: 0.003,
            })
          : reply('Some notes', 'google/gemini-3.1-flash-lite', {
              prompt_tokens: 1000,
              completion_tokens: 200,
              total_tokens: 1200,
              cost: 0.0002,
              completion_tokens_details: { reasoning_tokens: 50 },
            })
      }),
    )

    const { output } = await liveCheck()

    expect(output).toMatch(
      /Usage: 1,000 prompt \+ 200 completion tokens \(50 reasoning\) · \$0\.000200 · google\/gemini-3\.1-flash-lite via Test Provider · \d+\.\d s/,
    )
    expect(output).toMatch(
      /Usage: 2,000 prompt \+ 600 completion tokens · \$0\.003000 · anthropic\/claude-haiku-5\.5 via Test Provider/,
    )
    expect(output).toContain('Total: 4 calls · 6,000 prompt + 1,600 completion tokens · $0.006400')
  })
})
