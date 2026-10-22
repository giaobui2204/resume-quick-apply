const { chromium, expect } = require('@playwright/test');

const makeJob = (index, experience) => ({
  id: `${experience}-${index}`, ats: 'lever', externalId: `${experience}-${index}`,
  canonicalUrl: `https://jobs.lever.co/acme/${experience}-${index}`, applyUrl: `https://jobs.lever.co/acme/${experience}-${index}`,
  company: 'Acme', title: `${experience === 'entry' ? 'New Grad' : experience === 'senior' ? 'Senior' : 'General'} Software Engineer ${index}`,
  location: 'San Francisco, CA', description: 'Fixture posting', capturedAt: new Date().toISOString(),
  classification: { experience, workMode: index % 2 ? 'hybrid' : 'remote', employment: index < 10 ? 'full_time' : 'contract', evidence: { experience: experience === 'unknown' ? [] : ['Explicit fixture title'], workMode: ['Employer workplace metadata'], employment: ['Employer commitment metadata'] } }
});
const jobs = [...Array.from({ length: 30 }, (_, i) => makeJob(i, 'senior')), ...Array.from({ length: 31 }, (_, i) => makeJob(i, 'entry')), makeJob(0, 'unknown')];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/jobs/discover?*', route => {
      const params = new URL(route.request().url()).searchParams;
      requests.push(Object.fromEntries(params));
      const q = (params.get('q') || '').toLowerCase();
      const matching = jobs.filter(job => (!q || `${job.title} ${job.company}`.toLowerCase().includes(q)) &&
        ['experience', 'workMode', 'employment'].every(key => !params.get(key) || params.get(key) === 'all' || job.classification[key] === params.get(key)));
      const offset = Number(params.get('offset') || 0);
      const limit = Number(params.get('limit') || 30);
      return route.fulfill({ json: { jobs: matching.slice(offset, offset + limit), total: matching.length, offset, limit, hasMore: offset + limit < matching.length, errors: [], sources: [{ id: 'palantir', company: 'Palantir', ats: 'lever' }], cachedUntil: new Date(Date.now() + 300000).toISOString() } });
    });
    await page.goto(process.env.APP_URL || 'http://localhost:3000');
    await page.getByRole('button', { name: 'Jobs', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(30);
    await expect(page.getByRole('heading', { name: 'Find your next move.', exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/applypilot-search-desktop.png' });
    await page.getByRole('radio', { name: 'Entry / new grad', exact: true }).check();
    await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(30);
    await expect(page.locator('.job-card').first()).toContainText('New Grad');
    await page.getByLabel('Job keywords', { exact: true }).fill('unsent draft');
    await page.getByRole('button', { name: 'Load more jobs', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(31);
    const last = requests.at(-1);
    if (last.experience !== 'entry' || last.q !== '') throw new Error('Pagination did not retain submitted criteria');
    await expect(page.getByRole('button', { name: 'Load more jobs', exact: true })).toHaveCount(0);
    console.log('PASS experience filter includes jobs beyond initial page, load more preserves applied criteria, no duplicates');

    await page.getByLabel('Job keywords', { exact: true }).fill('');
    await page.getByText('More filters', { exact: false }).click();
    await page.getByLabel('Work mode', { exact: true }).selectOption('remote');
    await page.getByLabel('Employment type', { exact: true }).selectOption('full_time');
    await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(5);
    await page.getByRole('button', { name: /Remove experience filter/ }).click();
    await expect(page.locator('.job-card')).toHaveCount(11);
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(30);
    await page.getByRole('radio', { name: 'Not specified', exact: true }).check();
    await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(1);
    await expect(page.locator('.job-card')).toContainText('General Software Engineer');
    await page.getByLabel('Job keywords', { exact: true }).fill('NoSuchJob');
    await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
    await expect(page.getByText('No matches for these filters', { exact: true })).toBeVisible();
    console.log('PASS combined facets, removable applied criteria, clear all, explicit unknown, honest empty state');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Job keywords', { exact: true }).fill('');
    await page.getByRole('radio', { name: 'Any level', exact: true }).check();
    await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
    await expect(page.locator('.job-card')).toHaveCount(30);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile search overflows');
    await page.screenshot({ path: '/tmp/applypilot-search-mobile.png' });
    await page.locator('.job-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/applypilot-search-mobile-results.png' });
    await page.route('**/api/jobs/discover?*', route => route.fulfill({ json: { jobs: [], total: 0, offset: 0, limit: 30, hasMore: false, errors: ['Palantir: unavailable'], sources: [], cachedUntil: new Date().toISOString() } }));
    await page.getByRole('button', { name: 'Find jobs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Search incomplete', exact: true })).toBeVisible();
    await expect(page.getByText('No matches for these filters', { exact: true })).toHaveCount(0);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS mobile filters/results, no browser exceptions');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
