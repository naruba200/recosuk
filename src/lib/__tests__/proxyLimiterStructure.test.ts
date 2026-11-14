/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * §AZ — the rate limiter moved from the handler's front door to
 * the osuFetch miss path, and getBeatmapFile left the limiter
 * entirely. index.ts runs on Deno (esm.sh imports, Deno.serve),
 * so vitest cannot import it — the wiring is audited as source
 * (same pattern as linkOsuLoginCard.test.ts). The pure seams
 * (exemption set, identity resolution, 429 descriptor) are
 * unit-tested in proxyHelpers.test.ts.
 *
 * What this pins:
 * - no front-door limiter: a cached answer costs nothing, because
 *   the limiter is only reached on a cache miss;
 * - exactly one limiter call site, inside osuFetch's coalesced
 *   miss callback, before throttle() + fetch;
 * - fetchBeatmapFile never touches the limiter (item 1);
 * - the 429 keeps its Retry-After header through the throw
 *   (the handler's catch path used to drop extra headers).
 */

const indexSrc = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/functions/osu-proxy/index.ts', import.meta.url),
  ),
  'utf8',
)

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker)
  expect(start, `missing marker: ${startMarker}`).toBeGreaterThan(-1)
  const end = src.indexOf(endMarker, start)
  expect(end, `missing marker: ${endMarker}`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const osuFetchSrc = sliceBetween(indexSrc, 'async function osuFetch(', 'async function runAction')
const fetchBeatmapFileSrc = sliceBetween(
  indexSrc,
  'async function fetchBeatmapFile(',
  'async function osuFetch(',
)
const handlerSrc = indexSrc.slice(indexSrc.indexOf('Deno.serve(async'))

describe('miss-path limiter wiring (§AZ)', () => {
  it('the handler has no front-door limiter call', () => {
    expect(handlerSrc).not.toContain('checkProxyRateLimit(')
  })

  it('exactly one limiter call site, reached from osuFetch before throttle()', () => {
    const callSites = indexSrc.match(/await checkProxyRateLimit\(/g) ?? []
    expect(callSites).toHaveLength(1)
    // The single call lives in chargeRateLimitOnMiss; osuFetch
    // reaches it through that helper, before throttle() + fetch.
    const chargerSrc = sliceBetween(
      indexSrc,
      'async function chargeRateLimitOnMiss(',
      'async function runAuthAction',
    )
    expect(chargerSrc).toContain('await checkProxyRateLimit(ctx)')
    expect(osuFetchSrc).toContain('await chargeRateLimitOnMiss(ctx, path)')
    expect(osuFetchSrc.indexOf('chargeRateLimitOnMiss')).toBeLessThan(
      osuFetchSrc.indexOf('await throttle()'),
    )
  })

  it('fetchBeatmapFile never touches the limiter', () => {
    expect(fetchBeatmapFileSrc).not.toContain('checkProxyRateLimit')
  })

  it('the handler routes exempt actions through the exemption helper', () => {
    expect(handlerSrc).toContain('isRateLimitExemptAction(action)')
  })

  it('ProxyError carries headers and the catch passes them to errorJson', () => {
    const proxyErrorSrc = sliceBetween(indexSrc, 'class ProxyError', 'function json(')
    expect(proxyErrorSrc).toContain('headers?: Record<string, string>')
    expect(handlerSrc).toContain('err.headers')
  })
})
