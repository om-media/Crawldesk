import { isIP } from 'net'

export class PrivateIpGuard {
  isBlocked(hostname: string): boolean {
    if (!hostname) return false
    const lower = hostname.toLowerCase()
    // Block localhost variants
    if (lower === 'localhost' || lower.startsWith('localhost.')) return true
    if (lower === '::1') return true
    if (lower === '0.0.0.0') return true

    const ipVersion = isIP(lower)
    if (ipVersion === 4 && this.isPrivateIPv4(lower)) return true
    if (ipVersion === 6 && this.isPrivateIPv6(lower)) return true
    return false
  }

  private isPrivateIPv4(ip: string): boolean {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4) return false
    const [a, b] = parts
    if (a === 0) return true
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  private isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase()
    // Unique local address fc00::/7 or link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('fe80')) return true
    if (lower === '::1') return true
    return false
  }
}
