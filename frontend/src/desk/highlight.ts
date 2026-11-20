// Minimal syntax highlighter for the integration code samples (no dependency): splits code into typed tokens.
// Covers what the samples use: comments, strings, numbers, keywords, literals, property keys and function calls.
export type CodeLanguage = 'javascript' | 'python' | 'bash' | 'json'
export type TokenType = 'comment' | 'string' | 'number' | 'keyword' | 'literal' | 'property' | 'function' | 'plain'
export type Token = { type: TokenType; text: string }

const KEYWORDS: Record<CodeLanguage, string[]> = {
  javascript: ['await', 'async', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'new', 'import', 'from', 'export', 'try', 'catch', 'throw'],
  python: ['import', 'from', 'def', 'return', 'if', 'else', 'elif', 'with', 'as', 'try', 'except', 'raise', 'for', 'in', 'and', 'or', 'not'],
  bash: ['curl', 'export', 'echo'],
  json: [],
}
const LITERALS = ['true', 'false', 'null', 'undefined', 'True', 'False', 'None']

const COMMENT: Record<CodeLanguage, string> = {
  javascript: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
  python: String.raw`#[^\n]*`,
  bash: String.raw`(?<![\w"'$])#[^\n]*`,
  json: String.raw`(?!)`,
}

export function tokenize(code: string, lang: CodeLanguage): Token[] {
  const words = KEYWORDS[lang].concat(LITERALS).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp([
    `(${COMMENT[lang]})`,                                        // 1 comment
    String.raw`("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\x60(?:\\.|[^\x60\\])*\x60)`, // 2 string
    String.raw`(\b\d+(?:\.\d+)?\b)`,                             // 3 number
    words ? `\\b(${words})\\b` : '(?!)',                         // 4 keyword / literal
    String.raw`([A-Za-z_][\w-]*)(?=\s*:(?!\/))`,                 // 5 property key (object / JSON / header)
    String.raw`([A-Za-z_]\w*)(?=\s*\()`,                         // 6 function call
  ].join('|'), 'g')
  const out: Token[] = []
  let last = 0
  for (const m of code.matchAll(re)) {
    if (m.index! > last) out.push({ type: 'plain', text: code.slice(last, m.index) })
    const type: TokenType = m[1] ? 'comment' : m[2] ? (lang === 'json' && /^\s*:/.test(code.slice(m.index! + m[0].length)) ? 'property' : 'string')
      : m[3] ? 'number' : m[4] ? (LITERALS.includes(m[4]) ? 'literal' : 'keyword') : m[5] ? 'property' : 'function'
    out.push({ type, text: m[0] })
    last = m.index! + m[0].length
  }
  if (last < code.length) out.push({ type: 'plain', text: code.slice(last) })
  return out
}
