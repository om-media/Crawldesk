const { chromium } = require('/tmp/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/snap/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const results = { tests: [], passed: 0, failed: 0 };
  const failures = [];

  function log(name, passed, detail = '') {
    const status = passed ? '  PASS' : '  FAIL';
    console.log(`${status} | ${name} ${detail}`);
    results.tests.push({ name, passed, detail });
    if (passed) results.passed++; else { results.failed++; failures.push(`${name}: ${detail}`); }
  }

  // Helper: wait for text to appear
  async function waitForText(text, timeout = 5000) {
    try {
      await page.waitForSelector(`text=${text}`, { timeout });
      return true;
    } catch { return false; }
  }

  // Helper: click sidebar nav item
  async function navigateTo(label) {
    const nav = await page.$(`nav >> text=${label}`) || await page.$(`a:has-text("${label}")`) || await page.$(`button:has-text("${label}")`);
    if (nav) { await nav.click(); await page.waitForTimeout(1500); return true; }
    return false;
  }

  // Helper: evaluate JS in page context
  async function eval(fn) { return page.evaluate(fn); }

  try {
    console.log('\n═══ CrawlDesk Full QA ═══\n');

    // ═══ 1. BOOT & INIT ═══
    console.log('\n--- 1. Boot & Mock Backend Init ---');
    await page.goto('http://localhost:5173/?mock=true', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const hasCrawldesk = await eval(() => !!window.crawldesk);
    log('Mock backend initializes', hasCrawldesk);
    if (!hasCrawldesk) {
      console.log('FATAL: Mock backend failed. Aborting.');
      await browser.close(); process.exit(1);
    }

    // Verify all API namespaces exist
    const namespaces = ['projects', 'crawls', 'urls', 'issues', 'links', 'keywords', 'clusters', 'exports', 'settings', 'app'];
    for (const ns of namespaces) {
      const exists = await eval((ns) => typeof window.crawldesk[ns] === 'object', ns);
      log(`API namespace: ${ns}`, exists);
    }

    // ═══ 2. PROJECT LIST SCREEN ═══
    console.log('\n--- 2. Projects Screen ---');
    const projects = await eval(() => window.crawldesk.projects.list().then(p => p.length));
    log('Projects load', projects >= 2, `found ${projects}`);

    // ═══ 3. SELECT PROJECT & OVERVIEW ═══
    console.log('\n--- 3. Project Selection & Overview ---');
    const firstCard = await page.$('.card');
    if (firstCard) {
      await firstCard.click();
      await page.waitForTimeout(2000);
    }

    // Select a project programmatically
    await eval(() => {
      const store = window.__PROJECT_STORE__ || window.useProjectStore;
      return window.crawldesk.projects.list().then(list => {
        if (list.length > 0) {
          return window.crawldesk.crawls.listByProject(list[0].id).then(crawls => {
            window.__TEST_PROJECT__ = list[0].id;
            window.__TEST_CRAWL__ = crawls?.[0]?.id || null;
            return { project: list[0].id, crawl: crawls?.[0]?.id };
          });
        }
      });
    });
    const testIds = await eval(() => ({ project: window.__TEST_PROJECT__, crawl: window.__TEST_CRAWL__ }));
    log('Test project/crawl IDs obtained', !!testIds.project, `project=${testIds.project} crawl=${testIds.crawl}`);

    // ═══ 4. PROJECT OVERVIEW ═══
    console.log('\n--- 4. Project Overview ---');

    // Test URL summary (the big bug we fixed)
    const urlSummary = await eval(() => window.crawldesk.urls.summarize('1'));
    log('URL summary returns data', urlSummary !== null && urlSummary !== undefined, `keys: ${urlSummary ? Object.keys(urlSummary).join(',') : 'null'}`);
    log('URL summary has totalUrls', urlSummary?.totalUrls !== undefined, `totalUrls=${urlSummary?.totalUrls}`);
    log('URL summary has statusCodeDistribution', urlSummary?.statusCodeDistribution !== undefined && Object.keys(urlSummary?.statusCodeDistribution || {}).length > 0, `keys=${Object.keys(urlSummary?.statusCodeDistribution || {}).join(',')}`);
    log('URL summary has depthDistribution', urlSummary?.depthDistribution !== undefined && Object.keys(urlSummary?.depthDistribution || {}).length > 0, `keys=${Object.keys(urlSummary?.depthDistribution || {}).join(',')}`);
    log('URL summary has avgResponseTimeMs', urlSummary?.avgResponseTimeMs !== undefined, `value=${urlSummary?.avgResponseTimeMs}`);
    log('URL summary has indexableCount', urlSummary?.indexableCount !== undefined, `value=${urlSummary?.indexableCount}`);

    // Test issue summary
    const issueSummary = await eval(() => window.crawldesk.issues.summarize('1'));
    log('Issue summary returns data', Array.isArray(issueSummary), `type=${typeof issueSummary} len=${Array.isArray(issueSummary) ? issueSummary.length : 'N/A'}`);

    // Test URL list
    const urlList = await eval(() => window.crawldesk.urls.list({ crawlId: '1', page: 0, pageSize: 5 }));
    log('URL list returns data', urlList?.items?.length > 0, `${urlList?.items?.length} items`);

    // ═══ 5. KEYWORDS ═══
    console.log('\n--- 5. Keywords Screen ---');
    const keywords = await eval(() => window.crawldesk.keywords.analyze('1', 'unigram'));
    log('Keywords: unigram analysis returns data', Array.isArray(keywords) && keywords.length > 0, `${keywords?.length} keywords`);

    const bigrams = await eval(() => window.crawldesk.keywords.analyze('1', 'bigram'));
    log('Keywords: bigram analysis returns data', Array.isArray(bigrams) && bigrams.length > 0, `${bigrams?.length} bigrams`);

    // ═══ 6. CLUSTERS ═══
    console.log('\n--- 6. Clusters Screen ---');
    const clusters = await eval(() => window.crawldesk.clusters.find('1'));
    log('Clusters: find returns data', Array.isArray(clusters) && clusters.length > 0, `${clusters?.length} clusters`);
    if (clusters?.length > 0) {
      log('Cluster has required fields', clusters[0].name !== undefined && clusters[0].urls !== undefined, `name=${clusters[0]?.name}`);
    }

    // ═══ 7. ISSUES ═══
    console.log('\n--- 7. Issues Screen ---');
    const issueDefs = await eval(() => window.crawldesk.issues.definitions());
    log('Issue definitions load', Array.isArray(issueDefs) && issueDefs.length > 0, `${issueDefs?.length} definitions`);

    const issues = await eval(() => window.crawldesk.issues.list({ crawlId: '1', page: 0, pageSize: 10 }));
    log('Issues list returns data', issues?.items?.length > 0 || issues?.total >= 0, `total=${issues?.total} items=${issues?.items?.length}`);

    // ═══ 8. LINKS ═══
    console.log('\n--- 8. Links Screen ---');
    const linkSummary = await eval(() => window.crawldesk.links.summarize('1'));
    log('Link summary returns data', linkSummary !== null, `keys=${linkSummary ? Object.keys(linkSummary).join(',') : 'null'}`);
    log('Link summary: totalLinks', linkSummary?.totalLinks > 0, `totalLinks=${linkSummary?.totalLinks}`);
    log('Link summary: totalInternal', linkSummary?.totalInternal > 0, `totalInternal=${linkSummary?.totalInternal}`);
    log('Link summary: totalExternal', linkSummary?.totalExternal > 0, `totalExternal=${linkSummary?.totalExternal}`);
    log('Link summary: brokenCount exists', linkSummary?.brokenCount !== undefined, `brokenCount=${linkSummary?.brokenCount}`);

    const linkList = await eval(() => window.crawldesk.links.list({ crawlId: '1', page: 0, pageSize: 10 }));
    log('Link list returns data', linkList?.items?.length > 0, `${linkList?.items?.length} link items`);

    // ═══ 9. RESULTS / URL TABLE ═══
    console.log('\n--- 9. Results Screen (URL Table) ---');
    const resultsData = await eval(() => window.crawldesk.urls.list({ projectId: '1', crawlId: '1', page: 0, pageSize: 10, sort: { field: 'id', direction: 'desc' } }));
    log('Sorted URL list returns data', resultsData?.items?.length > 0, `${resultsData?.items?.length} items`);
    if (resultsData?.items?.length > 0) {
      const firstUrl = resultsData.items[0];
      log('URL record has required fields', firstUrl.url !== undefined && firstUrl.statusCode !== undefined, `url=${firstUrl.url} status=${firstUrl.statusCode}`);

      // Test URL details
      const details = await eval(() => window.crawldesk.urls.get(String(resultsData.items[0].id)));
      log('URL details endpoint works', details !== null && details !== undefined, `type=${typeof details}`);
    }

    // ═══ 10. EXPORTS ═══
    console.log('\n--- 10. Export Functions ---');
    const exports = await eval(() => window.crawldesk.exports);
    log('Exports namespace exists', exports !== undefined, `type=${typeof exports}`);

    // ═══ 11. SETTINGS ═══
    console.log('\n--- 11. Settings ---');
    const settings = await eval(() => window.crawldesk.settings.get('1'));
    log('Settings endpoint works', settings !== null && settings !== undefined, `keys=${settings ? Object.keys(settings).join(',') : 'null'}`);

    // ═══ 12. VISUAL SCREEN TESTS ═══
    console.log('\n--- 12. Visual Screen Tests ---');

    // Navigate to Overview via sidebar
    const overviewNav = await page.$('text=Overview') || await page.$('[data-nav="overview"]');
    if (overviewNav) {
      await overviewNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/qa-01-overview.png', fullPage: true });
      log('Overview screen renders', true, 'screenshot saved');

      // Check KPI cards
      const kpiCards = await page.$$('.kpi-card');
      log('Overview shows KPI cards', kpiCards.length >= 3, `${kpiCards.length} cards`);

      // Check for zero-only data (the bug we fixed)
      const allZeros = await page.evaluate(() => {
        const cards = document.querySelectorAll('.kpi-card');
        return Array.from(cards).every(c => c.textContent?.includes('0') && !c.textContent?.match(/[1-9]/));
      });
      log('Overview data NOT all zeros', !allZeros, allZeros ? 'BUG: all KPIs show zero' : 'data present');
    } else {
      log('Overview nav item found', false, 'could not find Overview nav');
    }

    // Navigate to Results
    const resultsNav = await page.$('text=Results');
    if (resultsNav) {
      await resultsNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/qa-02-results.png', fullPage: true });
      const table = await page.$('table');
      log('Results screen shows table', !!table);
      const rows = await page.$$('tbody tr');
      log('Results table has rows', rows.length > 0, `${rows.length} rows`);
    } else {
      log('Results nav item found', false);
    }

    // Navigate to Issues
    const issuesNav = await page.$('text=Issues');
    if (issuesNav) {
      await issuesNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/qa-03-issues.png', fullPage: true });
      const severityCards = await page.$$('.kpi-card');
      log('Issues severity cards visible', severityCards.length >= 2, `${severityCards.length} cards`);
      const issueTable = await page.$('table');
      log('Issues table visible', !!issueTable);
    } else {
      log('Issues nav item found', false);
    }

    // Navigate to Links
    const linksNav = await page.$('text=Links');
    if (linksNav) {
      await linksNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/qa-04-links.png', fullPage: true });
      const linkKPIs = await page.$$('.kpi-card');
      log('Links KPI cards visible', linkKPIs.length >= 2, `${linkKPIs.length} cards`);

      // Check broken count
      const brokenText = await page.evaluate(() => {
        const el = document.querySelector('.text-red-500');
        return el?.textContent || 'not found';
      });
      log('Links shows broken count', brokenText !== 'not found', `value: ${brokenText}`);
    } else {
      log('Links nav item found', false);
    }

    // Navigate to Keywords
    const kwNav = await page.$('text=Keywords');
    if (kwNav) {
      await kwNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/qa-05-keywords.png', fullPage: true });
      const kwTable = await page.$('table');
      log('Keywords table visible', !!kwTable);
    } else {
      log('Keywords nav item found', false);
    }

    // Navigate to Clusters
    const clusterNav = await page.$('text=Clusters');
    if (clusterNav) {
      await clusterNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/tmp/qa-06-clusters.png', fullPage: true });
      const clusterContent = await page.$('.card, table');
      log('Clusters screen renders content', !!clusterContent);
    } else {
      log('Clusters nav item found', false);
    }

    // ═══ 13. DATA SHAPE VALIDATION ═══
    console.log('\n--- 13. Data Shape Validation ---');

    // URL record shape
    if (urlList?.items?.length > 0) {
      const u = urlList.items[0];
      const requiredFields = ['id', 'url', 'statusCode', 'title', 'indexability'];
      const missing = requiredFields.filter(f => u[f] === undefined);
      log('URL record has all required fields', missing.length === 0, `missing: ${missing.join(',') || 'none'}`);
    }

    // Link record shape
    if (linkList?.items?.length > 0) {
      const l = linkList.items[0];
      const requiredFields = ['id', 'sourceUrl', 'targetUrl', 'linkRelation'];
      const missing = requiredFields.filter(f => l[f] === undefined);
      log('Link record has all required fields', missing.length === 0, `missing: ${missing.join(',') || 'none'}`);
    }

    // ═══ 14. ERROR HANDLING ═══
    console.log('\n--- 14. Error Handling ---');

    // Test missing data
    const badSummary = await eval(() => window.crawldesk.urls.summarize('99999').catch(e => ({ error: e.message })));
    log('Error handling: missing crawl ID', badSummary?.error !== undefined || (badSummary && !badSummary.totalUrls), badSummary?.error ? `error: ${badSummary.error}` : 'returned empty/zero');

    // ═══ 15. RUN POST-CRAWL ═══
    console.log('\n--- 15. Post-Crawl Analysis ---');
    const postCrawlResult = await eval(() => window.crawldesk.issues.runPostCrawl('1').catch(e => ({ error: e.message })));
    log('runPostCrawl endpoint exists', postCrawlResult !== undefined, `result: ${JSON.stringify(postCrawlResult)?.substring(0, 80)}`);

  } catch (err) {
    console.error('Test error:', err.message);
    console.error(err.stack);
    await page.screenshot({ path: '/tmp/qa-test-error.png', fullPage: true }).catch(() => {});
    results.failed++;
    failures.push(`Fatal: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n═══ QA RESULTS ═══');
  console.log(`${results.passed} passed, ${results.failed} failed`);
  for (const t of results.tests) {
    console.log(`  ${t.passed ? '✓' : '✗'} ${t.name} ${t.detail}`);
  }
  if (failures.length > 0) {
    console.log('\n═══ FAILURES ═══');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  process.exit(results.failed > 0 ? 1 : 0);
})();