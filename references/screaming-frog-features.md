# Screaming Frog SEO Spider — Complete Feature Breakdown

> **Source of truth for CrawlDesk feature planning.** Last updated: 2026-05-14.
> Based on official docs, version history (v10–v23), blog posts, and tutorials.

---

## 1. CRAWLING ENGINE

### Core Crawling
- **Spider mode** — crawl a website from a seed URL, following links recursively
- **List mode** — paste/CSV-import URLs to audit without crawling
- **API mode** (v10+) — headless automation via REST API, no UI needed
- **CLI mode** — command-line interface for scripting and CI/CD pipelines
- **Scheduled crawls** — set recurring crawl schedules automatically
- **Crawl retention** (v23) — auto-delete old crawls to manage disk space
- **Multiple sitemaps** support — ingest multiple sitemap.xml files
- **Custom JavaScript** — inject custom JS functions during crawl; integrate with ChatGPT/LLM APIs for dynamic data extraction
- **Database storage mode** (v12+) — save all data to SQLite on disk instead of RAM, enabling crawls beyond memory limits (200k+ URLs)

### Crawl Configuration
- **Robots.txt** respect / ignore toggle
- **Sitemap.xml** parsing and submission
- **Crawl depth** limit control
- **URL patterns** — include/exclude via regex, wildcards, path segments
- **User-Agent** customization
- **Request delay** and concurrency controls
- **Authentication** — basic auth, form-based login support
- **Proxy** support
- **Custom headers** injection
- **Canonicalization** — handle www/non-www, HTTP/HTTPS, trailing slashes
- **Redirect following** — follow 3xx redirects, detect redirect chains and loops
- **JavaScript rendering** — headless Chrome rendering for SPAs and JS-heavy sites
- **AMP crawling** — crawl both AMP and non-AMP versions
- **Hreflang crawling** — international hreflang annotation detection

---

## 2. DATA COLLECTION TABS (What SF Collects Per URL)

SF collects data across these tabs for every crawled URL:

| Tab | Data Collected |
|-----|---------------|
| **Response Codes** | HTTP status, response time, content type, page size, last modified, cache control |
| **Page Titles** | Title tag text, length, word count |
| **Meta Descriptions** | Meta description text, length, word count |
| **Headings** | H1–H6 hierarchy, heading structure, missing H1s |
| **Images** | Src, alt text, title attribute, dimensions, file size, lazy loading |
| **CSS** | Stylesheet URLs, render-blocking detection, inline vs external |
| **JavaScript** | JS file URLs, inline scripts, render-blocking detection |
| **Links (Internal)** | Internal link count, anchor text, nofollow status, link depth |
| **Links (External)** | External link count, anchor text, nofollow status, domain distribution |
| **Broken Links** | 4xx/5xx internal links, orphaned pages |
| **Duplicate Content** | Exact duplicate titles, meta descriptions, page content |
| **Canonical** | Canonical URL, self-referencing, canonical chains |
| **Hreflang** | Hreflang annotations, missing return links, x-default |
| **AMP** | AMP version detection, amphtml links, AMP validation |
| **Structured Data** | Schema.org types, JSON-LD, Microdata, Rich Results validation (26+ Google features) |
| **Security** | HTTPS status, mixed content, HSTS, security headers |
| **Accessibility** | Missing alt text, empty links, heading order violations |
| **Carbon Footprint** | CO2 emissions estimate per page using CO2.js |
| **Page Speed Insights** | PSI scores (mobile/desktop) via Google API |
| **Mobile Usability** | Lighthouse mobile audit results |
| **Content Audit** | Word count, JS-rendered word count, JS word count %, readability metrics |
| **N-Grams** | Bigram/trigram frequency analysis of page content |
| **Anchor Text** | Aggregated anchor text distribution for internal/external links |
| **Custom Extraction** | User-defined XPath/CSS/regex extractions into custom columns |

---

## 3. ISSUES DETECTION (300+ SEO Issues)

SF validates against 300+ SEO issues, warnings, and opportunities across these categories:

### Response Codes
- 4xx errors (400, 401, 403, 404, 410, etc.)
- 5xx errors (500, 502, 503, 504)
- Redirect chains and loops
- Non-200 response codes

### Page Titles
- Missing title tags
- Duplicate title tags
- Title too long / too short
- Title contains stop words
- Keyword cannibalization (multiple pages targeting same keyword)

### Meta Descriptions
- Missing meta descriptions
- Duplicate meta descriptions
- Description too long / too short

### Headings
- Missing H1 tags
- Multiple H1 tags per page
- Missing H2–H6 hierarchy
- Empty headings

### Images
- Missing alt attributes
- Empty alt attributes on non-decorative images
- Large image file sizes
- Images without dimensions
- Lazy-loaded images not detected

### CSS
- Render-blocking CSS
- Duplicate stylesheets
- Orphaned CSS files
- CSS too large

### JavaScript
- Render-blocking JavaScript
- Duplicate JS files
- Orphaned JS files
- JavaScript errors in console
- JS-rendered content vs. source content mismatch

### Links (Internal)
- Broken internal links (4xx/5xx)
- Internal links with no response
- Orphaned pages (no internal links pointing to them)
- Deep pages (excessive crawl depth)
- Internal link count outliers

### Links (External)
- Broken external links
- Unsafe external links (HTTP instead of HTTPS)
- External link domain distribution analysis

### Duplicate Content
- Exact duplicate page titles
- Exact duplicate meta descriptions
- Exact duplicate page content
- Near-duplicate content detection

### Canonical
- Missing canonical tags
- Self-referencing canonicals
- Canonical chains
- Canonicalized URLs (URLs that point to a different canonical)
- No canonical URLs

### Hreflang
- Missing hreflang annotations
- Incomplete hreflang groups
- Hreflang not using canonical URLs
- Missing return links in hreflang
- Invalid hreflang values

### AMP
- Missing non-AMP return link
- AMP page without canonical
- AMP validation errors

### Structured Data
- Missing structured data
- Invalid structured data (JSON-LD errors)
- Missing required fields for Rich Results
- Deprecated schema types
- Validation against 26+ Google search features

### Security
- HTTP pages (non-HTTPS)
- Mixed content (HTTP resources on HTTPS pages)
- Missing HSTS header
- Missing security headers (X-Frame-Options, CSP, etc.)

### Accessibility
- Missing alt text on images
- Empty link text
- Heading order violations (skipping levels)
- Missing language attribute

### Carbon Footprint
- High CO2 emissions per page
- Site-wide carbon footprint estimate
- Sustainability rating (CO2.js integration)

### Page Speed / Performance
- Slow response times
- Large page sizes
- Unoptimized resources
- PSI score warnings (via Google PageSpeed Insights API)

### Mobile Usability
- Viewport not set
- Content wider than screen
- Tap targets too close together
- Font size too small
- Lighthouse mobile audit failures

### Content Quality
- Thin content (low word count)
- Missing meta descriptions on important pages
- Title/meta mismatch
- Keyword density analysis

---

## 4. VISUALISATIONS

SF has **three** visualization categories in the top-level menu:

### Crawl Visualisations
Shows how SF crawled the site (shortest path to each page):
- **Crawl Tree Graph** — hierarchical tree showing crawl paths from root
- **Force-Directed Crawl Diagram** — interactive node-link diagram showing all URLs and their relationships, filterable by status code, link type, etc.

### Directory Tree Visualisations
Shows the URL path structure (not crawl paths):
- **Directory Tree Graph** — hierarchical tree of URL directory structure
- **Force-Directed Directory Diagram** — force-directed layout of directory structure

### Word Clouds
- Frequency-based word cloud from page titles, meta descriptions, headings, or content text

### 3D Visualizations (v20.2)
- **3D Force-Directed Graph** — three-dimensional interactive visualization of site architecture

---

## 5. REPORTS TAB

The Reports tab provides pre-built analytical reports with charts and graphs:

- **Overview** — high-level crawl summary with pie charts and bar graphs
- **Crawl Analysis** — response code distribution, depth distribution, response time distribution, indexable vs non-indexable breakdown
- **SEO Elements** — title length distribution, meta description length, heading structure, word count distribution
- **Bulk Export** — export any report as CSV/Excel

---

## 6. ORGANIZATION FEATURE

- **Custom Groups** — create named groups to organize URLs across any tab
- **Filter by Group** — apply group filters to isolate specific URL sets
- **Cross-tab Organization** — groups persist across all tabs for consistent segmentation
- **Use Cases** — compare pre/post migration, separate by subdomain, group by campaign, segment by content type

---

## 7. SEGMENTS (v20.2)

- Define URL patterns to create dynamic segments
- Automatically categorize URLs into segments based on regex/path rules
- Analyze segments independently (e.g., all blog posts, all product pages, all category pages)
- Compare metrics across segments

---

## 8. CUSTOM EXTRACTION

### Custom Search
- Find URLs matching custom patterns using regex, XPath, or CSS selectors
- Search within page content, titles, meta tags, headings, links, etc.

### Custom Extraction
- Define custom columns to extract data from any part of the HTML
- Support for **XPath**, **CSS selectors**, and **regex** patterns
- Extract arbitrary data: prices, dates, author names, schema values, etc.
- Results appear as new columns in the main table
- **Visual Custom Extraction** — point-and-click interface for building extractions without writing code

---

## 9. INTEGRATIONS

### Google PageSpeed Insights (PSI) API
- Fetch Core Web Vitals scores (LCP, FID, CLS) for every crawled URL
- Mobile and desktop PSI scores
- Performance, accessibility, best practices, SEO scores
- Field data vs. lab data comparison

### Lighthouse Mobile Usability Audit
- Full Lighthouse audit results integrated into crawl data
- Mobile-specific issues: viewport, tap targets, font size, content width
- Performance metrics from Lighthouse

### Bing Webmaster Tools API
- Connect Bing Webmaster Tools account
- Import Bing index status and crawl data
- Compare SF crawl data with Bing's index

### Google Sheets Integration
- Direct API connection to export crawl data to Google Sheets
- Real-time sync of crawl results
- Automated reporting pipelines

### Ahrefs API (v23)
- Import Ahrefs backlink data into crawl results
- Enrich URLs with Ahrefs metrics (DR, UR, backlink count, referring domains)
- Combined analysis of technical SEO + backlink profile

---

## 10. AI / SEMANTIC FEATURES (v22–v23)

### Semantic Similarity / Embeddings (v22)
- Generate semantic embeddings for page content
- Find semantically similar pages across the site
- Identify content gaps and duplication beyond exact matching
- Cluster related pages by topic

### Content Cluster Diagram (v23)
- Visualize semantic content clusters as interactive diagrams
- See how pages group by topic similarity
- Identify orphaned content and content silos
- Inlinks/outlinks visualization within clusters

### Semantic Embedding Rules (v23)
- Create filter rules based on semantic similarity
- Find pages similar to a seed URL using embeddings
- Smart filtering beyond regex/path patterns

### Custom JavaScript + LLM Integration
- Run custom JavaScript during crawl
- Call external APIs including ChatGPT, Anthropic Claude, open-source LLMs
- Extract AI-generated insights from page content
- Automate content analysis at scale

---

## 11. CONTENT ANALYSIS

### Content Audit Tab
- Word count (HTML source vs. JS-rendered)
- JavaScript word count percentage
- Readability scores (Flesch Reading Ease)
- Spelling and grammar checks
- Keyword density analysis

### N-Grams Analysis
- Bigram and trigram frequency analysis
- Identify common phrase patterns across pages
- Content theme detection
- Duplicate content at phrase level

### Anchor Text Analysis
- Aggregated anchor text distribution for all internal links
- Aggregated anchor text for external links
- Top anchor texts per page
- Anchor text diversity metrics

---

## 12. COMPARISON MODES

SF supports multiple comparison modes for analyzing crawl data:

- **Compare mode** — compare two crawls side-by-side (e.g., pre/post migration, before/after changes)
- **Serp mode** — analyze SERP features and rich results presence
- **List mode** — audit a static list of URLs without crawling

---

## 13. EXPORT & REPORTING

### Export Formats
- CSV (all tabs)
- Excel / XLSX
- PDF reports
- JSON (API mode)

### Bulk Export
- Export any filtered view to CSV/Excel
- Custom column selection for exports
- Scheduled export automation

### Report Generation
- Pre-built report templates in Reports tab
- Custom report builder with drag-and-drop metrics
- Automated report scheduling

---

## 14. CONFIGURATION & SETTINGS

### Unified Config (v20.2)
- Share configuration profiles across team members
- Export/import config files
- Standardize crawl settings across organization

### Configuration Categories
- **General** — user agent, request delay, timeout, max pages
- **Spider** — follow redirects, external product links, image options
- **JavaScript** — render JS, execute custom JS, wait conditions
- **Advanced** — headers, cookies, authentication, proxy
- **robots.txt** — parsing rules
- **sitemap.xml** — sitemap handling
- **File settings** — export formats, database path
- **Look & Feel** — UI customization
- **Visualisations** — visualization defaults
- **Custom** — custom extraction rules, search patterns
- **Identity** — licensing, user info

---

## 15. PLATFORM & TECHNICAL

- **OS Support** — Windows, macOS, Linux
- **Memory Management** — RAM mode (fast, limited) and Database mode (disk-based, unlimited scale)
- **Concurrency** — configurable parallel request threads
- **Resumable crawls** — pause and resume interrupted crawls
- **Crawl statistics** — real-time progress tracking, ETA, URLs crawled/sec
- **Filtering & Sorting** — filter any column, sort by any metric, multi-column sorting
- **Color coding** — visual indicators for issues (red=error, amber=warning, green=ok)
- **Column customization** — show/hide columns, reorder, resize
- **Bookmarking** — save filtered views as bookmarks

---

## 16. PRICING MODEL

- **Free version** — limited to 500 URLs per crawl
- **Licensed version** — unlimited URLs, all features unlocked
- **Perpetual license** — one-time purchase, free updates for 1 year
- **Subscription** — annual subscription option available

---

## 17. VERSION HISTORY HIGHLIGHTS

| Version | Key Features Added |
|---------|-------------------|
| v10.0 | API mode (headless automation) |
| v11.0 | Enhanced structured data validation (26+ Google features) |
| v12.0 | Database storage mode (disk-based, unlimited scale) |
| v20.0 | Mobile usability audit, n-grams, anchor text insights, PSI integration, content audit tab, spelling/grammar checks, Flesch readability |
| v20.2 | 3D visualizations, segments, unified config |
| v21.0 | Carbon footprint calculator, Lighthouse integration, Bing Webmaster Tools API |
| v22.0 | Semantic similarity/embeddings, content cluster diagram, semantic embedding rules, custom JS + ChatGPT/LLM integration, multiple sitemaps |
| v23.0 | Insight audits (heatmap), Ahrefs v3 API, crawl retention auto-delete, enhanced PSI/Lighthouse |

---

## 18. COMPETITIVE DIFFERENTIATORS

What makes SF unique vs. other crawlers:
1. **Desktop-first** — runs locally, no cloud dependency, full data ownership
2. **300+ validated issues** — most comprehensive issue detection in the industry
3. **JavaScript rendering** — headless Chrome for SPA crawling
4. **Database mode** — crawl millions of URLs without memory limits
5. **API + CLI** — full automation capability
6. **Custom extraction** — XPath/CSS/regex for arbitrary data collection
7. **Semantic embeddings** — AI-powered content clustering (v22+)
8. **Multi-API integrations** — PSI, Lighthouse, Bing, Ahrefs, Google Sheets
9. **Carbon footprint** — sustainability auditing built in
10. **Free tier** — 500 URL crawl free forever

---

## 19. KNOWN LIMITATIONS

- No real-time monitoring (batch crawls only)
- No keyword rank tracking
- No backlink analysis built-in (requires Ahrefs API integration)
- No social media preview/audit
- No content marketing analytics
- No competitor analysis features
- No white-label reporting (paid add-on)
- Windows-only for some integrations (Google Sheets, Bing Webmaster Tools)

---

## 20. CRAWLDESK IMPLEMENTATION PRIORITY MAP

### Phase 1 (Core — already planned)
- Basic spider crawl with robots.txt/sitemap support
- Response codes, titles, meta descriptions, headings
- Internal/external links, broken links
- Canonical detection, redirect chains
- JavaScript rendering
- CSV/Excel export
- Database storage mode for scale

### Phase 2 (Issues & Analysis)
- Full 300+ issue detection engine
- Structured data validation
- Hreflang validation
- AMP validation
- Security header checks
- Image analysis (alt text, size, dimensions)
- Duplicate content detection
- Keyword cannibalization

### Phase 3 (Advanced Data Collection)
- Custom extraction (XPath/CSS/regex)
- N-grams analysis
- Anchor text aggregation
- Content audit tab with readability
- Page Speed Insights integration
- Mobile usability (Lighthouse)
- Carbon footprint calculator

### Phase 4 (Visualization & Organization)
- Crawl visualizations (tree graph, force-directed)
- Directory tree visualizations
- Word clouds
- Reports tab with charts
- Organization groups
- Segments

### Phase 5 (AI & Integrations)
- Semantic embeddings for content clustering
- Content cluster diagram
- LLM integration via custom JS
- Ahrefs API integration
- Bing Webmaster Tools API
- Google Sheets sync
- Scheduled crawls with retention

### Phase 6 (Automation & Platform)
- Full API mode
- CLI mode
- Unified config sharing
- Bulk export automation
- White-label reporting
