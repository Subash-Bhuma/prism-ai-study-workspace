"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Render a single LaTeX string (no delimiters). */
export function Tex({
  children,
  display = false,
  className,
}: {
  children: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(children, {
        displayMode: display,
        throwOnError: false,
        output: "html",
        strict: false,
      });
    } catch {
      return children;
    }
  }, [children, display]);
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Markdown renderer that understands $...$ and $$...$$ math. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          h1: ({ children }) => (
            <h3 className="font-serif text-xl font-medium mt-4 mb-2">{children}</h3>
          ),
          h2: ({ children }) => (
            <h4 className="font-serif text-lg font-medium mt-4 mb-2 text-foreground">{children}</h4>
          ),
          h3: ({ children }) => (
            <h5 className="text-base font-semibold mt-3 mb-1">{children}</h5>
          ),
          p: ({ children }) => <p className="my-2 leading-relaxed text-sm">{children}</p>,
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 text-sm">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 text-sm">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <pre className="my-2 rounded-md bg-muted p-3 text-xs overflow-x-auto scroll-fancy">
                  <code>{children}</code>
                </pre>
              );
            }
            return <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
