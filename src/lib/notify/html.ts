/**
 * Shared bits of the transactional email look, so login, invite and new-brief
 * mails read as the same product.
 *
 * Everything interpolated here goes through `escapeHtml` without exception. The
 * invite carries a maker-supplied studio name and a customer-supplied one —
 * both untrusted, both landing in HTML that a mail client will render.
 */
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

export interface EmailContent {
  subject: string
  html: string
  text: string
}

export interface LayoutInput {
  /** Small uppercase line above the title. */
  eyebrow: string
  title: string
  /** Sentences under the title. */
  intro?: string[]
  rows?: Array<[string, string]>
  cta?: { label: string; url: string }
  /** Small grey print at the bottom. */
  footnote?: string
}

export function renderEmail(input: LayoutInput): { html: string; text: string } {
  const { eyebrow, title, intro = [], rows = [], cta, footnote } = input

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666;margin:0 0 8px">${escapeHtml(eyebrow)}</p>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${intro.map((p) => `<p style="font-size:14px;line-height:1.5;margin:0 0 12px">${escapeHtml(p)}</p>`).join('')}
${
  rows.length
    ? `<table style="border-collapse:collapse;width:100%;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:44%">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`).join('')}
</table>`
    : ''
}
${
  cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : ''
}
${footnote ? `<p style="font-size:12px;color:#666">${escapeHtml(footnote)}</p>` : ''}
</body></html>`

  const text = [
    title,
    '',
    ...intro,
    ...(intro.length ? [''] : []),
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(rows.length ? [''] : []),
    ...(cta ? [`${cta.label}: ${cta.url}`, ''] : []),
    ...(footnote ? [footnote] : []),
  ].join('\n')

  return { html, text }
}
