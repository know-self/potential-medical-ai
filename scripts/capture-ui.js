import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDir = path.join(root, 'artifacts');
const preview = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let previewOutput = '';
preview.stdout.on('data', (chunk) => { previewOutput += chunk.toString(); });
preview.stderr.on('data', (chunk) => { previewOutput += chunk.toString(); });

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not start.\n${previewOutput}`);
}

const chats = [{
  id: 'visual-chat',
  title: 'Chest pain in a 62-year-old male',
  createdAt: '2026-07-19T09:00:00.000Z',
  updatedAt: '2026-07-19T10:24:00.000Z',
  messageCount: 2
}];

const messages = [{
  id: 'visual-user',
  chatId: 'visual-chat',
  role: 'user',
  content: 'What are the likely causes of chest pain in a 62-year-old male with hypertension and hyperlipidemia?',
  createdAt: '2026-07-19T10:24:00.000Z'
}, {
  id: 'visual-assistant',
  chatId: 'visual-chat',
  role: 'assistant',
  content: 'Chest pain has a broad differential. Prioritize life-threatening causes before common non-cardiac causes.\n\n- **Cardiac ischemia** — assess for acute coronary syndrome. [1]\n- **Aortic dissection** — consider tearing pain or pulse/BP differences. [2]\n- **Pulmonary embolism** — consider pleuritic pain, dyspnea and risk factors. [3]\n- **Pericarditis, reflux and musculoskeletal pain** remain possible after urgent causes are excluded. [4]\n\n### Evidence sources\n1. Current chest pain guideline — approved, tier 1.\n2. Current acute aortic syndrome guidance — approved, tier 1.\n3. Current pulmonary embolism guidance — approved, tier 1.\n4. Versioned differential diagnosis reference — approved, tier 1.\n\n**Safety note:** General information only; urgent chest pain requires immediate professional assessment.',
  createdAt: '2026-07-19T10:24:20.000Z'
}];

const health = {
  service: 'medical-chat-gateway',
  status: 'ok',
  knowledge: {
    service: 'medical-knowledge-plane',
    status: 'ok',
    freshness: {
      level: 'fresh',
      usable: true,
      checkedAt: '2026-07-19T10:23:00.000Z',
      sources: {}
    }
  },
  models: { openRouterConfigured: true, googleConfigured: true },
  localClinicalProcessing: false,
  timestamp: '2026-07-19T10:24:00.000Z'
};

const profile = {
  consent: { acceptedAt: '2026-07-19T09:00:00.000Z', revokedAt: null },
  context: {
    ageRange: '60–69',
    medications: ['Atorvastatin 20 mg daily'],
    allergies: ['No known drug allergies'],
    diagnoses: ['Hypertension', 'Hyperlipidemia'],
    pregnancyStatus: 'not-applicable',
    preferredLanguage: 'en'
  },
  timeline: [{
    id: 'timeline-1',
    occurredAt: '2026-07-19T10:15:00.000Z',
    type: 'symptom',
    label: 'Chest pain episode',
    value: 'Started this morning',
    confirmedByUser: true
  }]
};

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload)
  });
}

async function installMocks(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('medical-user-session', 'visual-session-token');
    localStorage.setItem('theme', 'light');
  });

  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/chats') return json(route, chats);
    if (request.method() === 'GET' && url.pathname === '/messages') return json(route, messages);
    if (url.pathname.startsWith('/chats/')) return json(route, chats[0]);
    if (url.pathname.startsWith('/messages/')) return json(route, messages[0]);
    return json(route, {});
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/health') return json(route, health);
    if (url.pathname === '/api/status') return json(route, { status: 'operational' });
    if (url.pathname === '/api/privacy/me') return json(route, profile);
    if (url.pathname === '/api/uploads') return json(route, {
      uploads: [{
        id: 'upload-1',
        filename: 'ESC-NSTE-ACS-Guideline.pdf',
        mimeType: 'application/pdf',
        extraction: { status: 'complete', confidence: 0.96 }
      }, {
        id: 'upload-2',
        filename: 'ACC-AHA-Chest-Pain-Guideline.pdf',
        mimeType: 'application/pdf',
        extraction: { status: 'complete', confidence: 0.94 }
      }]
    });
    if (url.pathname === '/api/shares') return json(route, {
      shares: [{ id: 'share-1', label: 'Clinician review', expiresAt: '2026-07-19T11:24:00.000Z', revokedAt: null }]
    });
    if (url.pathname === '/api/labs/explain') return json(route, { results: [] });
    return json(route, {});
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  if (result.documentWidth > result.viewport + 1 || result.bodyWidth > result.viewport + 1) {
    throw new Error(`${label} horizontal overflow: ${JSON.stringify(result)}`);
  }
}

let browser;
try {
  await fs.mkdir(outputDir, { recursive: true });
  await waitForServer('http://127.0.0.1:4173');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await installMocks(page);
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByText('Chest pain in a 62-year-old male', { exact: true }).click();
  await page.getByText('Cardiac ischemia', { exact: false }).waitFor();
  await assertNoHorizontalOverflow(page, 'desktop');
  if (!(await page.locator('.desktop-control-preview').isVisible())) throw new Error('Desktop assistant control rail is not visible');
  await page.screenshot({ path: path.join(outputDir, 'ui-desktop.png'), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page, 'mobile');
  if (await page.locator('.desktop-control-preview').isVisible()) throw new Error('Desktop assistant control rail should be hidden on mobile');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outputDir, 'ui-mobile.png'), fullPage: false });

  console.log('Visual smoke test passed: desktop and mobile screenshots captured without horizontal overflow.');
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
