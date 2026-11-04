import { test, expect, type Page } from '@playwright/test';

async function noErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('navigation reaches every section', async ({ page }) => {
  const errors = await noErrors(page);
  await page.goto('/#/dashboard');
  for (const label of ['Learning Center', 'Hydraulic Fundamentals', 'Component Library', 'Circuit Builder', 'Equipment Simulator', 'Hydraulic Playground', 'Virtual Workshop', 'Diagnostic Center', 'Repair Workshop', 'Equipment Profiles', 'Hydraulic Schematics', 'Assessments', 'Training Records', 'Settings', 'Dashboard']) {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: label }).click();
    await expect(page.locator('header h1')).toHaveText(label);
  }
  expect(errors).toEqual([]);
});

test('operate the dump truck: start, engage PTO, raise the body', async ({ page }) => {
  const errors = await noErrors(page);
  await page.goto('/#/simulator');
  await page.getByRole('button', { name: 'Start engine' }).click();
  await page.getByRole('button', { name: /PTO switch OFF/ }).click();
  await expect(page.getByText('PTO ENGAGED', { exact: true })).toBeVisible();
  await page.getByText('Latch controls').click();
  await page.getByRole('button', { name: 'Hoist RAISE (hold)' }).dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Time ×10' }).click();
  await expect.poll(async () => Number((await page.getByText(/^\d+\.\d°$/).first().textContent())?.replace('°', '')), { timeout: 30_000 }).toBeGreaterThan(20);
  await expect(page.getByText('PTO engaged.', { exact: true })).toBeVisible();
  // Install a gauge at TP1 and read pressure
  await page.getByRole('button', { name: 'Install at test point' }).click();
  await expect(page.getByRole('img', { name: /TP1:/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('full milestone: diagnose a hidden fault, repair it safely and verify', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await noErrors(page);
  await page.goto('/#/diagnostics');
  await page.getByRole('tab', { name: 'Practical training' }).click();
  await page.locator('section', { hasText: 'Nothing happens when the PTO is switched on' }).getByRole('button', { name: 'Start scenario' }).click();
  await expect(page.getByText('I flip the PTO switch and nothing happens', { exact: false }).first()).toBeVisible();

  // Hypothesis first
  await page.getByRole('tab', { name: 'Hypotheses & conclusions' }).click();
  await page.getByPlaceholder('e.g. Relief valve opening early').fill('PTO shift solenoid not powered or coil failed');
  await page.getByRole('button', { name: 'Add hypothesis' }).click();

  // Reproduce the complaint
  await page.getByRole('tab', { name: 'Operate & inspect' }).click();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await page.getByRole('button', { name: /PTO switch OFF/ }).click();
  await page.getByRole('button', { name: 'Hoist RAISE (hold)' }).dispatchEvent('pointerdown');
  await page.waitForTimeout(1500);
  await expect(page.getByText('PTO DISENGAGED', { exact: true })).toBeVisible();

  // Measure: voltage at connector (live), then resistance (switch off)
  await page.getByRole('tab', { name: 'Test & measure' }).click();
  await expect(page.getByText(/1[23]\.\d\d V/)).toBeVisible();
  await page.getByRole('group', { name: 'Multimeter' }).getByRole('button', { name: 'Record' }).click();
  await page.getByRole('button', { name: /PTO switch ON/ }).click();
  await page.getByLabel('Meter mode').selectOption('resistance');
  await expect(page.getByText('OL', { exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Multimeter' }).getByRole('button', { name: 'Record' }).click();

  // Confirm the failure
  await page.getByRole('tab', { name: 'Hypotheses & conclusions' }).click();
  await page.getByRole('combobox').filter({ hasText: 'Select item…' }).selectOption({ label: 'PTO shift solenoid' });
  await page.getByRole('combobox').filter({ hasText: 'Select failure mode…' }).selectOption({ label: 'PTO shift solenoid coil open' });
  await page.getByRole('button', { name: 'Confirm failure' }).click();

  // Repair in the Repair Workshop with enforced isolation
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Repair Workshop' }).click();
  await page.getByRole('button', { name: 'PTO shift solenoid', exact: true }).click();
  await page.locator('div', { hasText: /^Replace solenoid coil – PTO shift solenoid$/ }).locator('..').getByRole('button', { name: 'Start job' }).click();
  for (let i = 0; i < 12; i++) {
    const btn = page.getByRole('button', { name: 'Perform step' });
    if (!(await btn.isVisible().catch(() => false)) || (await btn.isDisabled())) break;
    await btn.click();
    await page.waitForTimeout(250);
  }
  await expect(page.getByText('Ready for operational verification in the equipment simulator.')).toBeVisible();

  // Verify by operation
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Diagnostic Center' }).click();
  await page.getByRole('button', { name: 'Declare repair complete' }).click();
  await page.getByRole('button', { name: 'Time ×10' }).click();
  await page.getByRole('tab', { name: 'Operate & inspect' }).click();
  await page.getByRole('button', { name: 'Rated' }).click();
  await page.getByRole('button', { name: 'Start engine' }).click();
  await page.getByRole('button', { name: /PTO switch OFF/ }).click();
  await expect(page.getByText('PTO ENGAGED', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: /Engine speed/ }).fill('0.35');
  await page.getByText('Latch controls').click();
  await page.getByRole('button', { name: 'Hoist RAISE (hold)' }).dispatchEvent('pointerdown');
  await expect(page.getByText('PTO engages and pump delivers flow').locator('..').getByText(/PTO engaged and pump delivering flow/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Loaded raise took/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Submit diagnosis & repair' }).click();
  await expect(page.getByRole('heading', { name: 'Diagnostic report' })).toBeVisible();
  await expect(page.getByText('Correctly identified: PTO shift solenoid coil open (pto-sol).')).toBeVisible();
  await expect(page.getByText('PTO shift solenoid coil is open circuit', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('circuit builder explains an incorrectly connected circuit', async ({ page }) => {
  await page.goto('/#/circuit-builder');
  await page.getByRole('button', { name: /8\. Find and fix/ }).click();
  await page.getByRole('button', { name: 'Check connections' }).click();
  await expect(page.getByText(/problem\(s\) found/)).toBeVisible();
  await expect(page.getByText(/NO overpressure protection/).first()).toBeVisible();
});

test('loading an equipment profile reconfigures the simulator', async ({ page }) => {
  await page.goto('/#/profiles');
  await page.getByRole('button', { name: /Tandem-axle dump truck – 20 t payload/ }).click();
  await page.getByRole('button', { name: 'Load into work bay' }).click();
  await expect(page.locator('main h1')).toContainText('Tandem-axle dump truck – 20 t payload');
});

test('playground: record a measurement on the engine', async ({ page }) => {
  await page.goto('/#/playground');
  await page.getByRole('button', { name: 'Record measurement' }).click();
  await expect(page.getByText('Actual simulation results (1)')).toBeVisible();
});

test('service crane: load the profile, set the stabilizer, rig and lift a load, see the load moment', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/profiles');
  await page.getByRole('button', { name: /Service truck – 2 t telescopic crane/ }).click();
  await page.getByRole('button', { name: 'Load into work bay' }).click();
  await expect(page.locator('main h1')).toContainText('Service truck – 2 t telescopic crane');
  await page.getByRole('button', { name: 'Start engine' }).click();
  await page.getByRole('button', { name: /PTO switch OFF/ }).click();
  await expect(page.getByText('PTO ENGAGED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Time ×10' }).click();
  await page.getByText('Latch controls').click();
  await page.getByRole('button', { name: 'Stabilizer DOWN (hold)' }).dispatchEvent('pointerdown');
  await expect(page.getByText('Stabilizer SET')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Stabilizer neutral' }).dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Winch DOWN (hold)' }).dispatchEvent('pointerdown');
  await expect(page.getByRole('button', { name: '1000 kg' })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Winch neutral' }).dispatchEvent('pointerdown');
  await page.getByRole('button', { name: '1000 kg' }).click();
  await page.getByRole('button', { name: 'Boom lift UP (hold)' }).dispatchEvent('pointerdown');
  await expect.poll(async () => Number((await page.getByText(/^-?\d+\.\d°$/).first().textContent())?.replace('°', '')), { timeout: 20_000, intervals: [100] }).toBeGreaterThan(8);
  await page.getByRole('button', { name: 'Boom lift neutral' }).dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Winch UP (hold)' }).dispatchEvent('pointerdown');
  await expect(page.getByText('1000 kg (suspended)', { exact: false })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Winch neutral' }).dispatchEvent('pointerdown');
  await expect(page.getByText(/Load moment [1-9]\d* %/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Boom extend OUT (hold)' }).dispatchEvent('pointerdown');
  await expect(page.getByText('LMI CUT-OUT')).toBeVisible({ timeout: 40_000 });
  expect(errors).toEqual([]);
});
