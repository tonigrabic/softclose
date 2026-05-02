'use client'

import { useState } from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConceptVisualProps {
  prompt: string
  imageDataUrl: string | null
  onGenerated: (dataUrl: string) => void
  className?: string
}

export function ConceptVisual({ prompt, imageDataUrl, onGenerated, className }: ConceptVisualProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/concept-visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const raw = await res.text()
      let data: { dataUrl?: string; error?: string } = {}
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data
        } catch {
          throw new Error('Invalid response from server')
        }
      }
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      if (!data.dataUrl) throw new Error('No image returned')
      onGenerated(data.dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate concept')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50/60 px-3 py-2.5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        role="note"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0 stroke-[1.75]" aria-hidden />
        <p className="text-xs leading-relaxed">
          <strong className="font-semibold">Concept for discussion only</strong> — not a plan,
          not a quote, and not what your kitchen will look like. Useful for naming what
          feels right and what feels off.
        </p>
      </div>

      {!imageDataUrl ? (
        <button
          type="button"
          onClick={generate}
          disabled={isLoading}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/50 py-12 text-sm font-medium transition-colors',
            !isLoading && 'hover:border-primary/40 hover:bg-accent/40 hover:text-foreground',
            isLoading && 'cursor-wait text-muted-foreground'
          )}
        >
          {isLoading ? (
            <>
              <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sketching a concept…
            </>
          ) : (
            <>
              <Sparkles className="size-4 stroke-[1.75]" aria-hidden />
              Generate a rough visual
            </>
          )}
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="Concept visual — illustrative only"
            className="h-auto w-full"
          />
          <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
            <span>Illustrative only</span>
            <button
              type="button"
              onClick={generate}
              disabled={isLoading}
              className="font-semibold text-foreground hover:underline disabled:opacity-40"
            >
              {isLoading ? 'Working…' : 'Try another'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  )
}
