// Markdown with math (KaTeX), the app's one rich-text format: Recognized
// Text, Summaries, Explainers, Questions and Feedback all render through it.
// Raw HTML in the Markdown is not rendered (react-markdown's default), which
// keeps model output safe to show.
import 'katex/dist/katex.min.css'
import Markdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex]

export function RichText({ children }: { children: string }) {
  return (
    <div className="rich-text">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {normalizeMath(children)}
      </Markdown>
    </div>
  )
}

/**
 * remark-math only knows `$...$` and `$$...$$`. Prompts ask for those, but
 * models still write `\(...\)` and `\[...\]` now and then: turn them into the
 * `$` forms (display math fenced on its own lines, as remark-math needs).
 */
export function normalizeMath(markdown: string): string {
  return markdown
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, math: string) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, math: string) => `$${math.trim()}$`)
}
