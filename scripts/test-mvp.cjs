const { chromium, expect } = require('@playwright/test');

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/jobs/discover?*', route => route.fulfill({ json: { jobs: [], errors: [], total: 0, sources: [], cachedUntil: new Date(Date.now() + 60000).toISOString() } }));
    await page.goto(process.env.APP_URL || 'http://localhost:3000');
    const nav = name => page.getByRole('button', { name, exact: true }).click();

    await nav('Application profile');
    await page.getByLabel('Legal name', { exact: true }).fill('MVP Tester');
    await page.getByLabel('Email', { exact: true }).fill('invalid-email');
    await expect(page.getByText('INCOMPLETE', { exact: true })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill('mvp@example.com');
    await expect(page.getByText('READY', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm authorization answers' }).click();
    await expect(page.getByText('VERIFIED', { exact: true })).toBeVisible();
    await page.getByLabel('I require employer sponsorship now', { exact: true }).check();
    await expect(page.getByText('NOT VERIFIED', { exact: true })).toBeVisible();
    await page.reload(); await nav('Application profile');
    await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue('MVP Tester');
    await page.getByRole('button', { name: 'Confirm authorization answers' }).click();
    console.log('PASS profile validation, persistence, authorization confirmation reset');

    await nav('Resume');
    await page.getByLabel('Choose a resume', { exact: true }).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
    await expect(page.getByText('Only PDF and DOCX resumes are supported.')).toBeVisible();
    if (process.env.RESUME_PATH) {
      const pending = page.waitForResponse(r => r.url().includes('/api/resumes/extract'), { timeout: 150000 });
      await page.getByLabel('Choose a resume', { exact: true }).setInputFiles(process.env.RESUME_PATH);
      const response = await pending;
      const body = await response.json();
      if (!response.ok()) throw new Error(`Resume extraction ${response.status()}: ${body.error}`);
      await nav('Application profile');
      await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue(body.profile.contact.legalName);
      await expect(page.getByRole('heading', { name: 'Experience', exact: true })).toBeVisible();
      await page.reload(); await nav('Application profile');
      await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue(body.profile.contact.legalName);
      console.log('PASS real resume extraction, editable sections, persistence:', JSON.stringify({ experiences: body.profile.experiences.length, educations: body.profile.educations.length, projects: body.profile.projects.length, skills: body.profile.skills.length }));
    }

    await nav('Jobs');
    await page.getByText('Have a specific job link? Import it manually', { exact: true }).click();
    await page.getByRole('button', { name: 'Analyze jobs' }).click();
    await expect(page.getByText('Paste at least one job link.')).toBeVisible();
    await page.getByLabel('Job links').fill('https://example.com/job');
    await page.getByRole('button', { name: 'Analyze jobs' }).click();
    await expect(page.getByText(/Only Greenhouse and Lever are supported/)).toBeVisible({ timeout: 30000 });
    // Deterministic fixtures exercise UI/queue behavior without depending on live vacancies.
    const job = id => ({ id, ats: 'lever', externalId: id, canonicalUrl: `https://jobs.lever.co/acme/${id}`, applyUrl: `https://jobs.lever.co/acme/${id}`, company: 'Acme', title: `Engineer ${id}`, location: 'Remote', description: 'Test fixture', capturedAt: new Date().toISOString() });
    await page.route('**/api/jobs/import', route => route.fulfill({ json: { jobs: [job('one'), job('one'), job('two')], errors: [] } }));
    await page.getByLabel('Job links').fill('https://jobs.lever.co/acme/one');
    await page.getByRole('button', { name: 'Analyze jobs' }).click();
    await expect(page.locator('.job-card')).toHaveCount(2);
    for (const card of await page.locator('.job-card').all()) await card.getByRole('button', { name: 'Add to queue', exact: true }).click();
    await nav('Applications');
    await expect(page.locator('.queue-item')).toHaveCount(2);
    await page.getByRole('button', { name: 'Prepare', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Prepare', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Needs manual help' }).click();
    await expect(page.getByRole('button', { name: 'Prepare', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Prepare', exact: true }).click();
    await page.getByRole('button', { name: 'I submitted this application' }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Prepare', exact: true }).click();
    await page.reload(); await nav('Applications');
    await expect(page.getByRole('link', { name: 'Open form' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
    await expect(page.locator('.queue-item')).toHaveCount(1);
    console.log('PASS job validation/deduplication, sequential queue, blocked retry, manual submission, removal');

    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ['Overview', 'Resume', 'Application profile', 'Jobs', 'Applications', 'Settings']) {
      await nav(name);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Mobile overflow: ${name}`);
    }
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Delete local data' }).click();
    await nav('Application profile');
    await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue('');
    await nav('Applications'); await expect(page.getByText('Your queue is empty')).toBeVisible();
    await page.reload(); await nav('Jobs'); await expect(page.getByText('No matching jobs yet')).toBeVisible();
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS mobile navigation, local deletion, no browser exceptions');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
