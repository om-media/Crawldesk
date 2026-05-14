// Global type declarations for CrawlDesk renderer

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
      }
      event?: {
        listen: <T = unknown>(event: string, cb: (event: { payload: T }) => void) => Promise<() => void>
      }
    }
    crawldesk?: any
  }
}

export {}