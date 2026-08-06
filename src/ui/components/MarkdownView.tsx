import { useState, type ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import "highlight.js/styles/github-dark.css"
import { Button } from "@/components/ui/button"
import { IconCheck, IconCopy } from "@tabler/icons-react"

function CodeBlock({ className, children }: ComponentProps<"code">) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || "")
  const language = match ? match[1] : "text"
  const code = String(children).replace(/\n$/, "")

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <>
              <IconCheck className="h-3 w-3 text-emerald-500" />
              Copied!
            </>
          ) : (
            <>
              <IconCopy className="h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="hljs">{children}</code>
      </pre>
    </div>
  )
}

const components = {
  code({ className, children, ...props }: ComponentProps<"code">) {
    const isBlock = Boolean(className) || String(children).includes("\n")
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>
    }
    return (
      <code
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children }: ComponentProps<"pre">) {
    return <>{children}</>
  },
  h1: (props: ComponentProps<"h1">) => (
    <h1 className="mb-3 mt-6 border-b border-border pb-2 text-2xl font-bold text-foreground" {...props} />
  ),
  h2: (props: ComponentProps<"h2">) => (
    <h2 className="mb-2 mt-6 text-xl font-semibold text-foreground" {...props} />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3 className="mb-2 mt-5 text-lg font-semibold text-foreground" {...props} />
  ),
  h4: (props: ComponentProps<"h4">) => (
    <h4 className="mb-2 mt-4 text-base font-semibold text-foreground" {...props} />
  ),
  h5: (props: ComponentProps<"h5">) => (
    <h5 className="mb-2 mt-4 text-sm font-semibold text-foreground" {...props} />
  ),
  h6: (props: ComponentProps<"h6">) => (
    <h6 className="mb-2 mt-4 text-sm font-semibold text-muted-foreground" {...props} />
  ),
  p: (props: ComponentProps<"p">) => (
    <p className="my-3 leading-relaxed text-foreground/90" {...props} />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-6" {...props} />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-6" {...props} />
  ),
  li: (props: ComponentProps<"li">) => <li className="leading-relaxed" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <a className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80" {...props} />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      className="my-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  hr: (props: ComponentProps<"hr">) => <hr className="my-6 border-border" {...props} />,
  img: (props: ComponentProps<"img">) => (
    <img className="my-4 max-w-full rounded-md" {...props} />
  ),
  table: (props: ComponentProps<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props: ComponentProps<"thead">) => (
    <thead className="border-b border-border bg-muted/50" {...props} />
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="px-3 py-2 text-left font-semibold text-foreground" {...props} />
  ),
  td: (props: ComponentProps<"td">) => (
    <td className="border-b border-border/60 px-3 py-2 align-top" {...props} />
  ),
  input: (props: ComponentProps<"input">) => (
    <input className="accent-primary" {...props} />
  ),
}

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
