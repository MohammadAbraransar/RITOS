import { describe, expect, it } from 'vitest'
import { tokenize } from './highlight'

const types = (code: string, lang: Parameters<typeof tokenize>[1]) =>
  tokenize(code, lang).filter(t => t.type !== 'plain').map(t => `${t.type}:${t.text}`)

describe('tokenize', () => {
  it('keeps every character (rendering the tokens reproduces the code)', () => {
    const code = "await fetch(url, { method: 'POST', body: JSON.stringify({ amount: 3999 }) }) // send\n"
    expect(tokenize(code, 'javascript').map(t => t.text).join('')).toBe(code)
  })
  it('highlights JavaScript', () => {
    expect(types("await fetch('x', { method: 'POST' }) // c", 'javascript'))
      .toEqual(['keyword:await', 'function:fetch', "string:'x'", 'property:method', "string:'POST'", 'comment:// c'])
  })
  it('highlights Python and keeps # inside strings', () => {
    expect(types('import requests\nr = requests.post("a#b", json={"n": 1})  # note', 'python'))
      .toEqual(['keyword:import', 'function:post', 'string:"a#b"', 'string:"n"', 'number:1', 'comment:# note'])
  })
  it('marks JSON keys as properties and values as strings', () => {
    expect(types('{"order_id": "ORD-1", "ok": true}', 'json'))
      .toEqual(['property:"order_id"', 'string:"ORD-1"', 'property:"ok"', 'literal:true'])
  })
  it('does not treat URLs as property keys or comments', () => {
    expect(types("curl -X POST 'http://host:8000/api'", 'bash')).toEqual(['keyword:curl', "string:'http://host:8000/api'"])
  })
})
