import { describe, it, expect } from 'vitest'
import { PrivateIpGuard } from '../src/worker/engine/private-ip-guard'

describe('PrivateIpGuard', () => {
  const guard = new PrivateIpGuard()

  it('blocks localhost', () => {
    expect(guard.isBlocked('localhost')).toBe(true)
  })

  it('blocks 127.0.0.1', () => {
    expect(guard.isBlocked('127.0.0.1')).toBe(true)
  })

  it('blocks private IP ranges (10.x.x.x)', () => {
    expect(guard.isBlocked('10.0.0.1')).toBe(true)
  })

  it('blocks private IP ranges (192.168.x.x)', () => {
    expect(guard.isBlocked('192.168.1.1')).toBe(true)
  })

  it('blocks private IP ranges (172.16-31.x.x)', () => {
    expect(guard.isBlocked('172.16.0.1')).toBe(true)
  })

  it('allows public IPs', () => {
    expect(guard.isBlocked('8.8.8.8')).toBe(false)
  })

  it('allows normal hostnames', () => {
    expect(guard.isBlocked('example.com')).toBe(false)
  })

  it('blocks ::1 IPv6 localhost', () => {
    expect(guard.isBlocked('::1')).toBe(true)
  })

  it('blocks fe80:: link-local IPv6', () => {
    expect(guard.isBlocked('fe80::1')).toBe(true)
  })

  it('does not block empty hostname', () => {
    expect(guard.isBlocked('')).toBe(false)
  })
})
