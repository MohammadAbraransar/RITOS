// Dark code panel for integration samples: language tabs, label, copy button, line numbers, Fira Code, scrolling.
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { tokenize, type CodeLanguage } from './highlight'
import './hub.css'

export type CodeSample = { label: string; language: CodeLanguage; code: string }

const LANGUAGE_NAME: Record<CodeLanguage, string> = { javascript: 'JavaScript', python: 'Python', bash: 'Shell', json: 'JSON' }

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers or contexts without the async clipboard (e.g. plain http on another host)
    const el = document.createElement('textarea')
    el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
    document.body.appendChild(el); el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  }
}

export function CopyButton({ text, label = 'Copy', dark = false }: { text: string; label?: string; dark?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className={`hub-copy${dark ? ' is-dark' : ''}`} aria-label={done ? 'Copied' : `${label} to clipboard`}
      onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1600) } }}>
      {done ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span>{done ? 'Copied' : label}</span>
    </button>
  )
}

/** One or more samples of the same call; tabs appear when there is more than one. */
export function CodeBlock({ samples, maxHeight = 380 }: { samples: CodeSample[]; maxHeight?: number }) {
  const [active, setActive] = useState(0)
  const s = samples[Math.min(active, samples.length - 1)]
  const lines = s.code.split('\n')
  return (
    <figure className="code-block">
      <figcaption className="code-head">
        {samples.length > 1 ? (
          <div className="code-tabs" role="tablist" aria-label="Code language">
            {samples.map((x, i) => (
              <button key={x.label} type="button" role="tab" aria-selected={i === active}
                className={`code-tab${i === active ? ' is-active' : ''}`} onClick={() => setActive(i)}>{x.label}</button>
            ))}
          </div>
        ) : <span className="code-title">{s.label}</span>}
        <span className="code-lang">{LANGUAGE_NAME[s.language]}</span>
        <CopyButton text={s.code} dark />
      </figcaption>
      <pre className="code-body" style={{ maxHeight }} tabIndex={0} aria-label={`${s.label} code`}>
        <code>
          <span className="code-gutter" aria-hidden="true">{lines.map((_, i) => <span key={i}>{i + 1}</span>)}</span>
          <span className="code-text">
            {tokenize(s.code, s.language).map((t, i) => t.type === 'plain' ? t.text : <span key={i} className={`tk-${t.type}`}>{t.text}</span>)}
          </span>
        </code>
      </pre>
    </figure>
  )
}
