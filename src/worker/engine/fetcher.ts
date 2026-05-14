import http from 'http'
import https from 'https'
import type { FetchResult, RedirectHop } from '../../shared/types/url'
import { normalizeUrl } from './normalizer'
import { PrivateIpGuard } from './private-ip-guard'

export interface FetchConfig {
  timeoutMs: number
  userAgent: string
  maxRedirects: number
  maxBodySize: Record<string, number>
  rateLimitPerHost: number  // Max concurrent requests per host
  requestDelayMs: number   // Delay between requests to same host (ms)
}

const DEFAULT_CONFIG: FetchConfig = {
  timeoutMs: 15000,
  userAgent: 'CrawlDeskBot/0.1 (+https://example.com/bot)',
  maxRedirects: 5,
  maxBodySize: { html: 5 * 1024 * 1024, other: 1 * 1024 * 1024 },
  rateLimitPerHost: 3,     // Respectful default: 3 concurrent per host
  requestDelayMs: 500,     // 500ms delay between requests to same host
}

function makeError(url: string, headersObj: Record<string, string>, contentType: string, bodyLen: number, elapsed: number, chain: RedirectHop[], code: string, message: string): FetchResult {
  return { body: Buffer.alloc(0), statusCode: 0, headers: headersObj, finalUrl: url, contentType, contentLength: bodyLen, responseTimeMs: elapsed, redirectChain: [...chain], error: { code, message } }
}

// Simple rate limiter: tracks last fetch time per hostname and enforces delays
class RateLimiter {
  private lastFetch: Map<string, number> = new Map()

  async waitForSlot(hostname: string, minDelayMs: number): Promise<void> {
    const last = this.lastFetch.get(hostname) ?? 0
    const now = Date.now()
    const waitMs = Math.max(0, minDelayMs - (now - last))
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))
    this.lastFetch.set(hostname, Date.now())
  }
}

export class Fetcher {
  private guard = new PrivateIpGuard()
  private rateLimiter = new RateLimiter()

  constructor(private config?: Partial<FetchConfig>) {}

  async fetch(url: string): Promise<FetchResult> {
    const startTime = Date.now()
    try {
      return await this.fetchWithRedirects(url, [], 0, startTime)
    } catch (err: any) {
      return makeError(url, {}, '', 0, Date.now() - startTime, [], 'connection_error', err.message || 'Connection failed')
    }
  }

  private async fetchWithRedirects(
    url: string, chain: RedirectHop[], depth: number, startTime: number
  ): Promise<FetchResult> {
    const cfg = { ...DEFAULT_CONFIG, ...this.config! }

    const normalized = normalizeUrl(url)
    if (normalized.error && normalized.error.code === 'unsupported_protocol') {
      return makeError(url, {}, '', 0, Date.now() - startTime, chain, 'unsupported_protocol', 'Protocol not supported')
    }
    if (this.guard.isBlocked(normalized.hostname)) {
      return makeError(url, {}, '', 0, Date.now() - startTime, chain, 'blocked_private_ip', 'Private IP blocked')
    }

    // Rate limit by hostname to avoid overwhelming servers
    if (normalized.hostname && this.config?.requestDelayMs !== undefined) {
      await this.rateLimiter.waitForSlot(normalized.hostname, this.config.requestDelayMs)
    }

    return new Promise((resolve) => {
      try {
        const req = (url.startsWith('https://') ? https : http).get(url, {
          headers: { 'User-Agent': cfg.userAgent },
          timeout: cfg.timeoutMs,
          rejectUnauthorized: false,
        }, (res) => {
          const statusCode = res.statusCode ?? 0
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(res.headers || {})) {
            headers[k.toLowerCase()] = Array.isArray(v) ? v[0]! : (v ?? '')
          }

          if ([301, 302, 303, 307, 308].includes(statusCode) && depth < cfg.maxRedirects && res.headers.location) {
            let nextUrl = res.headers.location!
            try { nextUrl = new URL(nextUrl, url).href } catch {}
            const normNext = normalizeUrl(nextUrl)
            if (this.guard.isBlocked(normNext.hostname)) {
              resolve(makeError(url, headers, '', 0, Date.now() - startTime, [...chain], 'blocked_private_ip', 'Redirect target is a private IP'))
              return
            }
            this.fetchWithRedirects(nextUrl, [...chain, { url, statusCode }], depth + 1, startTime).then(resolve)
            res.resume()
            return
          }

          const contentType = headers['content-type'] || ''
          const maxBody = cfg.maxBodySize.html

          const chunks: Buffer[] = []
          let totalLen = 0
          res.on('data', (chunk: Buffer) => {
            totalLen += chunk.length
            if (totalLen > maxBody) {
              resolve({ body: Buffer.concat(chunks), statusCode, headers, finalUrl: res.url ?? url, contentType, contentLength: totalLen, responseTimeMs: Date.now() - startTime, redirectChain: chain, error: { code: 'body_too_large', message: `Response exceeded ${maxBody} bytes` } })
              res.destroy()
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => {
            const body = Buffer.concat(chunks)
            resolve({ body, statusCode, headers, finalUrl: res.url ?? url, contentType, contentLength: totalLen, responseTimeMs: Date.now() - startTime, redirectChain: [...chain] })
          })
        })

        req.on('error', (err: NodeJS.ErrnoException) => {
          let errorCode = 'connection_error'
          if (err.code === 'ENOTFOUND') errorCode = 'dns_error'
          else if (err.code === 'ECONNREFUSED') errorCode = 'connection_refused'
          else if (err.code?.startsWith('ERR_TLS')) errorCode = 'tls_error'
          else if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) errorCode = 'timeout'
          resolve(makeError(url, {}, '', 0, Date.now() - startTime, chain, errorCode, err.message))
        })

        req.on('timeout', () => { req.destroy() })
        req.end()
      } catch (err: any) {
        resolve(makeError(url, {}, '', 0, Date.now() - startTime, chain, 'fetch_error', err.message))
      }
    })
  }
}
