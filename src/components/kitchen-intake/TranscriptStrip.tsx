'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ClientMessage } from '@/lib/types'

interface TranscriptStripProps {
  messages: ClientMessage[]
  className?: string
}

/** Drops the trailing assistant turn — its text is already shown in the live <h1>. */
function completedTurns(messages: ClientMessage[]): ClientMessage[] {
  if (messages.length === 0) return []
  const last = messages[messages.length - 1]
  if (last?.role === 'assistant') return messages.slice(0, -1)
  return messages
}

export function TranscriptStrip({ messages, className }: TranscriptStripProps) {
  const rows = completedTurns(messages)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [rows.length])

  if (rows.length === 0) return null

  return (
    <div
      ref={scrollerRef}
      className={cn(
        'max-h-44 space-y-2.5 overflow-y-auto rounded-2xl border border-border/70 bg-muted/30 px-3 py-3 sm:max-h-52',
        className
      )}
    >
      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        So far
      </p>
      <ul className="space-y-2">
        {rows.map((m, i) => (
          <li
            key={i}
            className={cn(
              'rounded-xl px-3 py-2 text-[0.8125rem] leading-relaxed',
              m.role === 'assistant'
                ? 'bg-card text-foreground/90 ring-1 ring-border/60'
                : 'bg-primary/[0.08] text-foreground'
            )}
          >
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {m.role === 'assistant' ? 'Question' : 'You'}
            </span>
            <span className="whitespace-pre-wrap">{m.content}</span>
            {m.images && m.images.length > 0 && (
              <span className="mt-1 block text-[10px] text-muted-foreground">
                + {m.images.length} photo{m.images.length > 1 ? 's' : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
