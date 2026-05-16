import { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import { selectBestCrawlId } from '../utils/crawl-selection'

export function useResolvedCrawl() {
  const { selectedProjectId, activeCrawlId, setActiveCrawlId } = useProjectStore()
  const [resolvingCrawl, setResolvingCrawl] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedProjectId || activeCrawlId || !window.crawldesk) {
      setResolvingCrawl(false)
      return
    }

    let cancelled = false
    setResolvingCrawl(true)
    setResolveError(null)
    window.crawldesk.crawls.listByProject(selectedProjectId)
      .then((crawls: any[]) => {
        if (!cancelled) setActiveCrawlId(selectBestCrawlId(crawls as any[]))
      })
      .catch((e: any) => {
        console.error('[useResolvedCrawl] Failed to resolve latest crawl:', e)
        if (!cancelled) setResolveError(e?.message || 'Failed to find the latest crawl for this project.')
      })
      .finally(() => {
        if (!cancelled) setResolvingCrawl(false)
      })

    return () => { cancelled = true }
  }, [selectedProjectId, activeCrawlId, setActiveCrawlId])

  return { selectedProjectId, activeCrawlId, resolvingCrawl, resolveError }
}
