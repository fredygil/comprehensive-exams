// Markdown, the app's one rich-text format (Recognized Text, Summaries,
// Explainers, Questions, Feedback).
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const remarkPlugins = [remarkGfm]

export function RichText({ children }: { children: string }) {
  return (
    <div className="rich-text">
      <Markdown remarkPlugins={remarkPlugins}>{children}</Markdown>
    </div>
  )
}
