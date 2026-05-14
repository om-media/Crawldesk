# Screaming Frog SEO Spider - Complete Feature Analysis

**Version:** 23.3 (Feb 2026) | **License:** £199/year (~$259)
**Free tier:** 500 URLs max

## 1. CRAWLING ENGINE
- Spider Mode: Standard recursive crawl from a start URL
- List Mode: Crawl URLs from a list (CSV, sitemap XML, etc.)
- SERP Mode: Crawl Google search results pages
- Compare Mode: Compare two crawls against each other
- API Mode: Crawl via API integration
- JavaScript Rendering: Headless Chromium rendering for JS-heavy sites
- HTTP/2 support in JS rendering mode
- Proxy support with authentication
- Custom user-agent strings
- Cookie storage and session handling
- Basic & Digest authentication
- Web form authentication with profiles
- Crawl all subdomains option
- CDN URL handling
- Robots.txt respect (or ignore + report)
- HSTS policy following
- Redirect following (configurable max hops)
- Canonical following
- Pagination (rel=next/prev) following
- Fragment identifier crawling
- iframe crawling
- AMP page crawling
- Meta refresh redirect detection
- PDF crawling with link extraction
- Response timeout configuration
- 5XX retry configuration
- Memory allocation settings
- Storage mode (file-based vs in-memory)
- Crawl retention (auto-delete old crawls)
- Scheduled crawls with email notifications

## 2. DATA EXTRACTION - ALL COLUMNS PER URL
Address, Content Type, Status Code, Status Text, Indexability,
Indexability Status, Title (1 & 2), Title Length, Title Pixel Width,
Meta Description (1 & 2), Meta Description Length, Meta Description
Pixel Width, Meta Keywords (1 & 2), Meta Keywords Length, H1 (1-4),
H1 Length, H2 (1-4), H2 Length, Canonical (HTML + Rendered + HTTP),
Canonical Occurrences, Meta Robots, X-Robots-Tag, hreflang (HTML +
HTTP + Sitemap), rel=next/prev (HTML + HTTP), Language, Word Count,
Text Ratio, JS Word Count %, Word Count Change (JS delta), HTML Size,
Total Page Size, Transferred Size, Total Requests, Crawl Depth,
Folder Depth, Length, Domain, Path, Response Times, Last-Modified,
HTTP Version, Crawled As (desktop/mobile), Hash (MD5 duplicate check)

## 3. LINKS ANALYSIS
Internal Inlinks (total + unique), Internal Outlinks (total + unique),
External Outlinks (total + unique), Unique External Outlinks,
Unique JS Inlinks/Outlinks (rendered-only links), Link Origin
(HTML/Rendered/Both/Dynamically Loaded), Link Path (XPath),
DoFollow/NoFollow count, NoFollow types (nofollow/UGC/sponsored),
Target attributes (_blank, _self, etc.), Path Type (absolute/protocol-
relative/root-relative/path-relative), Inlinks to Root Domain,
Inlinks to Subdomain, Outlinks to Root Domain, Outlinks to Subdomain,
Linked Root Domains, Total Equity-Passing Links, External Equity-
Passing Links, Site Wide vs Not Site Wide links, Link Score (0-100)

## 4. IMAGES ANALYSIS
Image Count, Image Size, Content Type, Real Dimensions (WxH),
Display Dimensions (WxH via JS render), Alt Text, Decorative image
detection, Empty alt detection, img srcset extraction, Total Image
Size per page

## 5. CSS/JS/RESOURCE ANALYSIS
CSS Count, CSS Size, JavaScript Count, JavaScript Size, JavaScript
Execution Time, Media Count, Media Size, Font Count, Third Party
Count, Third Party Size, Other Count, Other Size, Duplicated
JavaScript detection, Total Requests per page

## 6. SEO ISSUES DETECTED (per category)
Page Titles: Missing, Duplicate, Too Long, Too Short, Truncated,
  Multiple titles, JS-modified titles
Meta Descriptions: Missing, Duplicate, Too Long, Too Short, Multiple,
  Outside head element, JS-modified
H1 Tags: Missing, Multiple, Duplicate, Empty, JS-modified
H2 Tags: Missing, Multiple, Duplicate
Canonicals: Missing, Multiple, Self-referencing, JS-modified,
  HTTP canonical vs HTML canonical mismatch
Meta Robots: noindex, nofollow, nosnippet, etc. detection
X-Robots-Tag: HTTP header directives
hreflang: Missing, Mismatched, Circular, Self-referencing
AMP: Valid/Invalid/Valid with Warnings verdict
Pagination: rel=next/prev missing or incorrect
Redirects: Broken redirects, Redirect chains, Redirect loops,
  Redirect types (HTTP/HSTS/JS/Meta Refresh)
Response Codes: 4xx errors, 5xx errors, 3xx redirects, 200 OK
Indexability: Non-indexable URLs with reasons
Duplicate Content: Exact duplicates (MD5 hash), Near duplicates
  (configurable similarity threshold, default 90%)
Thin Content: Low word count pages
Content: Missing titles/descriptions, keyword cannibalization

## 7. STRUCTURED DATA / SCHEMA
Structured Data detection (JSON-LD, Microdata, RDFa)
Schema.org validation with error/warning counts
Google Rich Results validation (valid/invalid/warnings)
Rich Results Types detected per page
Rich Results Types Errors list
Rich Results Warnings list
Unique Structured Data Types count
Validation errors by field type

## 8. PERFORMANCE / PAGE SPEED
Lighthouse Integration:
  - Performance Score (0-100)
  - First Contentful Paint (time + score)
  - Largest Contentful Paint (time + score)
  - Cumulative Layout Shift (score)
  - Speed Index (time + score)
  - Time to Interactive (time + score)
  - Total Blocking Time (ms + score)
  - Max Potential First Input Delay (ms + score)
  - Render Blocking Requests Savings
  - Reduce Unused CSS/JS Savings
  - Minify CSS/JS Savings
  - Font Display Savings
  - Preconnect Candidates Savings
  - Efficient Cache Policy Savings
  - Improve Image Delivery Savings
  - Legacy JavaScript Savings
  - Minimize Main-Thread Work
  - Layout Shift Culprits
  - LCP Breakdown
  - LCP Request Discovery
  - Tap Targets score
  - Viewport score
  - Plugins score
  - Font Display score
  - Content Width score
CrUX (Chrome User Experience Report) Field Data:
  - TTFB (time + category)
  - FCP (time + category)
  - LCP (time + category)
  - INP (time + category)
  - CLS (score + category)
  - Origin-level CWV assessment

## 9. SEARCH CONSOLE INTEGRATION
Google Search Analytics data:
  - Impressions, Clicks, CTR, Average Position
  - Top 10/Top 3/Top 100 queries
  - Top 10/Top 3/Top 100 pages by traffic
  - Top 10/Top 3/Top 100 pages by value
  - Indexed URLs count
  - Coverage data (valid/valid with warnings/error/excluded)
  - Last Crawled timestamp
  - Page Fetch status
  - Indexing Allowed status
  - Google-Selected Canonical

## 10. ANALYTICS INTEGRATION
Google Analytics integration:
  - Sessions, New Users, Bounce Rate, Avg Session Duration
  - Page Views Per Session
  - Goal Completions, Goal Conversion Rate, Goal Value
  - Traffic Top 10/Top 3 pages
  - Social: Facebook Shares/Likes/Comments, Twitter, Pinterest, GPlus

## 11. BACKLINK / LINK METRICS INTEGRATION
Ahrefs API (v3):
  - URL Rating, Domain Rating
  - Backlinks count, Referring Domains
  - External Backlinks EDU/GOV
  - Citation Flow, Trust Flow
  - Trust Flow Topics
  - Top 10 linking pages by value
Majestic API:
  - Citation Flow, Trust Flow
  - RefDomains, RefPages, RefClass C
  - Referring IPs, Referring Subnets
  - Root Domains Linking
  - Subdomains Linking
Moz API:
  - Page Authority, Domain Authority
  - MozRank (Combined + External Equity)
  - MozTrust
  - Spam Score

## 12. AI / SEMANTIC FEATURES
Custom AI Prompts:
  - OpenAI, Gemini, Ollama, Anthropic integration
  - Custom prompt templates per crawl
  - Dynamic columns from prompt results
Embeddings:
  - Vector embeddings of page content
  - Semantic similarity search across crawled URLs
  - Near duplicate detection via semantic similarity (not just hash)
  - Content clustering by topic similarity
  - Visualizations of semantically related pages
  - Embedding Rules for filtering which pages to embed

## 13. CONTENT ANALYSIS
Flesch Reading Ease Score (0-100 readability)
Average Words Per Sentence
Spelling & Grammar Check (configurable language)
Spelling Errors count, Grammar Errors count
N-grams extraction
Custom Search: Find URLs containing/NOT containing specific strings
Custom Extraction: Regex-based data extraction with named columns
Content area definition (configurable selectors)

## 14. ACCESSIBILITY
WCAG 2.0 A Violations count
WCAG 2.0 AA Violations count
WCAG 2.1 AA Violations count
WCAG 2.2 AA Violations count
Best Practice Violations count
All Violations total
Location on Page for each issue
Show Issue in Browser / Show Issue in Rendered HTML

## 15. SECURITY
Cookie analysis: Name, Value, Domain, Type (HTTP/On-Page),
  Expiration Time, HttpOnly, Secure attributes
Mixed content detection
Security header analysis

## 16. EXPORT & OUTPUT
CSV export (full crawl data)
Bulk Export options:
  - All URLs, All Inlinks, All Outlinks
  - Broken Links (all 4xx/5xx)
  - Redirect Chains
  - Duplicate Content
  - Missing Titles/Descriptions/H1s
  - Non-Indexable URLs
  - Response Code categories
  - Structured Data errors
  - Image Alt Text issues
  - Canonical issues
  - hreflang issues
XML Sitemap generation (HTML pages, PDFs, Images)
HTML Sitemap generation
JSON export
Google Sheets integration (direct push)

## 17. URL MANAGEMENT
URL Rewriting rules
Remove Parameters (query string stripping)
Regex Replace for URL normalization
CDN URL mapping
Include/Exclude URL patterns
Limit by URL path
Limit crawl total (max URLs)
Limit crawl depth (max clicks)
Limit URLs per crawl depth
Limit max folder depth
Limit number of query strings
Limit max URL length
Max links per URL to crawl
Max page size to crawl

## 18. SEGMENTATION & ANALYSIS
Custom Segments (filter + group URLs)
Crawl Analysis (aggregate statistics)
SEO Elements summary (counts per issue category)
Response Time distribution
Depth distribution
Indexable vs Non-Indexable breakdown
Segment-based filtering and comparison

## 19. USER INTERFACE
Tabbed interface (Internal, External, Images, CSS, JS, Links, etc.)
Internal tab combines all data except External/hreflang/Structured Data
Sortable/filterable columns
Multi-select URLs for comparison
View Source / Rendered HTML / Rendered Page screenshots
SERP Snippet preview tool
Configurable column display
Language selection

## 20. LOG FILE ANALYSER (SEPARATE PRODUCT)
Server log file parsing and analysis
Crawl vs Log comparison
User agent breakdown
Response code distribution from logs
Top requested URLs from logs
Bot vs human traffic separation
Crawl budget analysis

---

## CRAWLDESK CURRENT STATE vs SCREAMING FROG

### Already implemented:
- Basic recursive crawling
- Project management
- URL database (SQLite)
- Status code tracking
- Internal/external link detection
- Basic SEO issues (missing titles, meta descriptions)
- XML sitemap generation
- CSV export
- JavaScript rendering (via Playwright)
- Pagination support

### Missing - Priority tiers:

**Phase 1 (Core SEO - next 3-6 months):**
- Structured data / Schema validation (JSON-LD, Microdata, RDFa)
- Near-duplicate detection (hash + semantic similarity)
- hreflang analysis (HTML + HTTP + Sitemap)
- Advanced URL rewriting/normalization (regex replace, parameter removal)
- Redirect chain/loop detection
- Canonical comparison (HTML vs HTTP vs Google-selected)
- Bulk export by issue category
- Thin content detection (word count thresholds)

**Phase 2 (Integrations - 6-12 months):**
- Lighthouse API integration for performance metrics
- Google Search Console API (indexing, coverage, performance)
- Google Analytics API (traffic, engagement metrics)
- Custom AI prompts on crawl data (OpenAI/Gemini/Ollama)
- Embeddings for semantic content clustering

**Phase 3 (Advanced - 12+ months):**
- Accessibility audit (WCAG 2.0/2.1/2.2 violations)
- Log File Analyser mode
- Crawl comparison mode
- Segmentation system
- Scheduled crawls with notifications
- Backlink metrics integration (Ahrefs/Moz/Majestic APIs)
- Carbon footprint calculation
- Image dimension analysis (real vs display via JS render)
- SERP snippet preview tool

---

## KEY DIFFERENTIATORS TO CONSIDER

Screaming Frog is a **desktop app** (Java-based). Our advantages:
1. **Local-first + API** — they don't have a proper API or programmatic interface
2. **SQLite database** — their data is in-memory/CSV; we persist to SQLite for queries
3. **Web UI** — they're a desktop app; we can build a browser-based experience
4. **Multi-project** — they handle one site per crawl; we support projects
5. **Open source** — they charge £199/year; we can be free/open
6. **Extensible** — skills, MCP servers, cron jobs, subagents

Their strengths we should match:
- Comprehensive issue detection (they check 20+ issue types per URL)
- Multiple data sources in one view (crawl + Search Console + Analytics + Lighthouse)
- Bulk export workflows for SEO teams
- JavaScript rendering for SPAs
- Structured data validation
