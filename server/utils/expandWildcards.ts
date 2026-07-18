/**
 * Expand Dynamic-Prompts style `{a|b|c}` variant syntax to a concrete literal.
 *
 * TS mirror of the worker-side expander (comfy-docker/core/workflow_manager.py
 * `expand_wildcards`). We run it in malris at job activation so the persisted
 * job parameters (and thus the history UI) record the *selected* prompt rather
 * than the template. The worker won't re-expand — no braces remain.
 *
 * Supported syntax:
 *   - {a|b|c}          random pick of one option
 *   - {3::a|1::b}      weighted pick (weight before `::`)
 *   - {2$$a|b|c}       pick N options, joined by ", "
 *   - {1-3$$a|b|c}     pick a random count in the range
 *   - {2$$ + $$a|b|c}  custom separator between picks
 *   - nesting, e.g. {big {red|blue}|small}
 * Text with no braces is returned unchanged.
 */
export function expandWildcards(text: string, rng: () => number = Math.random): string {
  if (!text || !text.includes('{')) return text

  const innermost = /\{([^{}]*)\}/g

  const parseOption = (opt: string): [number, string] => {
    const m = /^\s*([0-9]*\.?[0-9]+)\s*::([\s\S]*)$/.exec(opt)
    if (m) {
      const w = parseFloat(m[1])
      if (!Number.isNaN(w)) return [w, m[2]]
    }
    return [1, opt]
  }

  const weightedSample = (options: Array<[number, string]>, k: number): string[] => {
    const chosen: string[] = []
    const pool = options.slice()
    const n = Math.min(k, pool.length)
    for (let c = 0; c < n; c++) {
      const total = pool.reduce((s, [w]) => s + w, 0) || 1
      let r = rng() * total
      let idx = 0
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i][0]
        if (r <= 0) { idx = i; break }
      }
      chosen.push(pool[idx][1])
      pool.splice(idx, 1)
    }
    return chosen
  }

  const expandGroup = (body: string): string => {
    let sep = ', '
    let countSpec: string | null = null
    let optsStr = body
    if (body.includes('$$')) {
      const segs = body.split('$$')
      if (segs.length === 2) {
        countSpec = segs[0]; optsStr = segs[1]
      } else if (segs.length >= 3) {
        countSpec = segs[0]; sep = segs[1]; optsStr = segs.slice(2).join('$$')
      }
    }
    const options = optsStr.split('|').map(parseOption)
    if (countSpec !== null) {
      const cs = countSpec.trim()
      let k = 1
      const mr = /^(\d+)\s*-\s*(\d+)$/.exec(cs)
      if (mr) {
        let lo = parseInt(mr[1], 10)
        let hi = parseInt(mr[2], 10)
        if (lo > hi) { const t = lo; lo = hi; hi = t }
        k = lo + Math.floor(rng() * (hi - lo + 1))
      } else if (/^\d+$/.test(cs)) {
        k = parseInt(cs, 10)
      }
      return weightedSample(options, k).join(sep)
    }
    const picks = weightedSample(options, 1)
    return picks.length ? picks[0] : ''
  }

  let out = text
  for (let guard = 0; guard < 100; guard++) {
    let changed = false
    const next = out.replace(innermost, (_m, body: string) => {
      changed = true
      return expandGroup(body)
    })
    if (!changed) break
    out = next
  }
  return out
}
