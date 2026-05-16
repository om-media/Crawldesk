export function crawlUrlCount(crawl: any): number {
  return Number(crawl?.urlCount ?? crawl?.url_count ?? 0)
}

export function selectBestCrawlId(crawls: any[] | null | undefined): string | null {
  if (!crawls || crawls.length === 0) return null

  const withUrls = crawls.filter(crawl => crawlUrlCount(crawl) > 0)
  const completedWithUrls = withUrls.find(crawl => String(crawl?.status ?? '').toLowerCase() === 'completed')
  const selected = completedWithUrls ?? withUrls[0] ?? crawls[0]

  return selected?.id != null ? String(selected.id) : null
}
