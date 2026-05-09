import type { PageResult } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'

/**
 * Detects missing/incomplete Open Graph and Twitter Card meta tags.
 */
export function detectSocialIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  if (!result.seo) return issues

  const seo = result.seo!
  const sm = seo.socialMeta

  // --- Missing OG tags entirely ---
  if (seo.hasOgTags !== true && !sm?.ogTitle && !sm?.ogDescription && !sm?.ogImageUrl) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_og_tags', severity: 'medium',
      message: 'Page is missing Open Graph meta tags.',
      recommendation: 'Add og:title, og:description, and og:image for proper social media sharing previews.',
    })
  } else if ((sm?.ogTitle || sm?.ogDescription) && !sm?.ogImageUrl) {
    // OG tags present but no image
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'og_missing_image', severity: 'low',
      message: 'Open Graph tags are missing og:image.',
      recommendation: 'Add og:image to ensure rich preview cards when shared on Facebook/LinkedIn.',
    })
  }

  // --- Missing Twitter Card ---
  if (!seo.hasTwitterCard && !sm?.twitterCard) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_twitter_card', severity: 'low',
      message: 'Page is missing Twitter Card meta tags.',
      recommendation: 'Add twitter:card meta tag for proper Twitter preview rendering.',
    })
  } else if (sm?.twitterCard && !sm?.twitterImageUrl) {
    // Twitter card present but no image
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'twitter_missing_image', severity: 'low',
      message: 'Twitter Card is missing image.',
      recommendation: 'Add twitter:image for visual preview in Twitter feeds.',
    })
  }

  return issues
}
