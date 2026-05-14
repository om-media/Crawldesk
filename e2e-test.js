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

  function log(name, passed, detail = '') {
    const status = passed ? '  PASS' : '  FAIL';
    console.log(`${status} | ${name} ${detail}`);
    results.tests.push({ name, passed, detail });
    if (passed) results.passed++; else results.failed++;
  }

  try {
    // ─── Setup ──────────────────────────────────────────────────
    console.log('\n═══ CrawlDesk E2E Tests ═══\n');

    // Test 1: App loads and mock backend initializes
    console.log('--- 1. App Load & Mock Backend ---');
    await page.goto('http://localhost:5173/?mock=true', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const hasCrawldesk = await page.evaluate(() => !!window.crawldesk);
    log('Mock backend initializes', hasCrawldesk);
    await page.screenshot({ path: '/tmp/crawldesk-test-01-load.png', fullPage: true });

    if (!hasCrawldesk) {
      console.log('ERROR: Mock backend failed to initialize. Aborting.');
      await browser.close();
      process.exit(1);
    }

    // Verify project count
    const projectCount = await page.evaluate(() => window.crawldesk.projects.list().then((p) => p.length));
    log('Projects list loads', projectCount >= 2, `found ${projectCount} projects`);

    // Test 2: Project cards visible
    console.log('\n--- 2. Project List ---');
    const projectCards = await page.$$('.card');
    log('Project cards visible', projectCards.length >= 2, `${projectCards.length} cards`);

    // Test 3: New Project modal — URL input accepts typing
    console.log('\n--- 3. New Project Modal — URL Input ---');
    const newProjectBtn = await page.$('button:has-text("New Project"), button:has-text("Create")');
    if (newProjectBtn) {
      await newProjectBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: '/tmp/crawldesk-test-03-modal.png', fullPage: true });

      const modal = await page.$('.fixed.inset-0, [class*="z-[100]"]');
      log('New Project modal opens', !!modal);

      // Find name and URL inputs
      const inputs = await page.$$('input');
      log('Modal shows input fields', inputs.length >= 2, `${inputs.length} inputs found`);

      // Type in name input
      const nameInput = inputs[0];
      if (nameInput) {
        await nameInput.fill('Test Mock Project');
        const nameValue = await nameInput.inputValue();
        log('Name input accepts typing', nameValue === 'Test Mock Project', `value: "${nameValue}"`);
      }

      // Type in URL input
      const urlInput = inputs[1];
      if (urlInput) {
        await urlInput.fill('https://testmock.com');
        const urlValue = await urlInput.inputValue();
        log('URL input accepts typing', urlValue.includes('testmock'), `value: "${urlValue}"`);
      }

      // Close modal (click outside or Cancel)
      const cancelBtn = await page.$('button:has-text("Cancel")');
      if (cancelBtn) await cancelBtn.click();
      await page.waitForTimeout(500);
    } else {
      log('New Project button found', false, 'button not found');
    }

    // Test 4: Select project — toolbar URL auto-populates
    console.log('\n--- 4. Project Selection — Toolbar URL Auto-Populate ---');
    const firstCard = await page.$('.card');
    if (firstCard) {
      await firstCard.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/crawldesk-test-04-select.png', fullPage: true });

      // Check if toolbar URL field is populated
      const urlField = await page.$('.url-field input');
      if (urlField) {
        const toolbarUrl = await urlField.inputValue();
        log('Toolbar URL auto-populates after project selection', toolbarUrl.length > 0, `url: "${toolbarUrl}"`);
        log('Toolbar URL contains project domain', toolbarUrl.includes('avanterra') || toolbarUrl.includes('silentjam'), `url: "${toolbarUrl}"`);
      } else {
        log('Toolbar URL auto-populates', false, 'URL field not found');
      }
    } else {
      log('Project card found', false, 'no cards to click');
    }

    // Test 5: Links page — Internal/External filters
    console.log('\n--- 5. Links Page — Internal/External Filters ---');
    // Navigate to Links via sidebar
    const linksNav = await page.$('text=Links');
    if (linksNav) {
      await linksNav.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/crawldesk-test-05-links-all.png', fullPage: true });

      // Check links table
      const linksTable = await page.$('table');
      log('Links table visible', !!linksTable);

      const allRows = await page.$$('tbody tr');
      log('Links show data (All)', allRows.length > 0, `${allRows.length} rows`);

      // Test Internal filter
      const internalBtn = await page.$('button:has-text("Internal")');
      if (internalBtn) {
        await internalBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/tmp/crawldesk-test-05-internal.png', fullPage: true });

        const internalRows = await page.$$('tbody tr');
        log('Internal filter shows rows', internalRows.length > 0, `${internalRows.length} rows`);

        // Verify all rows are internal
        if (internalRows.length > 0) {
          const allInternal = await page.evaluate(() => {
            const cells = document.querySelectorAll('tbody tr td:nth-child(5)');
            return Array.from(cells).every(cell => cell.textContent?.includes('Yes'));
          });
          log('All filtered rows are internal', allInternal);
        }
      }

      // Test External filter
      const externalBtn = await page.$('button:has-text("External")');
      if (externalBtn) {
        await externalBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/tmp/crawldesk-test-05-external.png', fullPage: true });

        const externalRows = await page.$$('tbody tr');
        log('External filter shows rows', externalRows.length > 0, `${externalRows.length} rows`);

        // Verify all rows are external
        if (externalRows.length > 0) {
          const allExternal = await page.evaluate(() => {
            const cells = document.querySelectorAll('tbody tr td:nth-child(5)');
            return Array.from(cells).every(cell => cell.textContent?.includes('No'));
          });
          log('All filtered rows are external', allExternal);
        }
      }

      // Click All to reset
      const allBtn = await page.$('button:has-text("All")');
      if (allBtn) await allBtn.click();
      await page.waitForTimeout(500);
    }

    // Test 6: Data persistence — navigate to Results and back
    console.log('\n--- 6: Data Persistence Across Pages ---');
    const resultsNav = await page.$('text=Results, :text("Results")');
    if (resultsNav) {
      await resultsNav.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/crawldesk-test-06-results.png', fullPage: true });

      const resultsTable = await page.$('table');
      log('Results table visible after navigation', !!resultsTable);

      const resultRows = await page.$$('tbody tr');
      log('Results show data after page switch', resultRows.length > 0, `${resultRows.length} rows`);

      // Navigate away and come back
      const issuesNav = await page.$('text=Issues, :text("Issues")');
      if (issuesNav) {
        await issuesNav.click();
        await page.waitForTimeout(1000);

        // Back to Results
        const resultsNav2 = await page.$('text=Results, :text("Results")');
        if (resultsNav2) {
          await resultsNav2.click();
          await page.waitForTimeout(1000);
          
          const resultRows2 = await page.$$('tbody tr');
          log('Data persists after navigating away and back', resultRows2.length > 0, `${resultRows2.length} rows`);
        }
      }
    }

    // Test 7: Issues page
    console.log('\n--- 7: Issues Page ---');
    const issuesNav2 = await page.$('text=Issues, :text("Issues")');
    if (issuesNav2) {
      await issuesNav2.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/crawldesk-test-07-issues.png', fullPage: true });

      const issuesContent = await page.$('table, .card');
      log('Issues page loads', !!issuesContent);

      // Check severity counts
      const severityCards = await page.$$('.kpi-card');
      log('Severity KPI cards visible', severityCards.length > 0, `${severityCards.length} cards`);
    }

  } catch (err) {
    console.error('Test error:', err.message);
    console.error(err.stack);
    await page.screenshot({ path: '/tmp/crawldesk-test-error.png', fullPage: true }).catch(() => {});
    results.failed++;
  } finally {
    await browser.close();
  }

  console.log('\n═══ RESULTS ═══');
  console.log(`${results.passed} passed, ${results.failed} failed`);
  for (const t of results.tests) {
    console.log(`  ${t.passed ? '✓' : '✗'} ${t.name} ${t.detail}`);
  }
  process.exit(results.failed > 0 ? 1 : 0);
})();