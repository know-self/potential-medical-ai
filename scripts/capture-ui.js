import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { preview as startVitePreview } from 'vite';

const root = process.cwd();
const outputDir = path.join(root, 'artifacts');

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
      failClosed: true,
      checkedAt: '2026-07-19T10:23:00.000Z',
      sources: {
        pubmed: { required: true, fresh: true },
        'clinicaltrials.gov': { required: true, fresh: true },
        'openfda-drug-enforcement': { required: true, fresh: true },
        'cdc-content-services': { required: true, fresh: true }
      }
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
  }, {
    id: 'timeline-2',
    occurredAt: '2026-07-19T09:45:00.000Z',
    type: 'measurement',
    label: 'ECG result',
    value: 'No ST elevation reported',
    confirmedByUser: true
  }, {
    id: 'timeline-3',
    occurredAt: '2026-07-18T16:30:00.000Z',
    type: 'measurement',
    label: 'LDL cholesterol',
    value: '98 mg/dL',
    confirmedByUser: true
  }]
};

const uploads = [{
  id: 'upload-1',
  filename: 'ESC-NSTE-ACS-Guideline.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 911000,
  createdAt: '2026-07-19T09:02:00.000Z',
  updatedAt: '2026-07-19T09:05:00.000Z',
  extraction: {
    status: 'complete',
    confidence: 0.96,
    version: 'v2',
    page: 23,
    snippets: [{ text: 'Cardiac troponin I or T is the preferred biomarker for myocardial injury assessment.', page: 23, confidence: 0.97 }, { text: 'An ECG should be obtained promptly to identify acute ischaemic changes.', page: 23, confidence: 0.95 }, { text: 'Risk stratification should guide the urgency of additional testing and management.', page: 24, confidence: 0.91 }]
  }
}, {
  id: 'upload-2',
  filename: 'ACC-AHA-Chest-Pain-Guideline.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1240000,
  createdAt: '2026-07-19T09:04:00.000Z',
  updatedAt: '2026-07-19T09:07:00.000Z',
  extraction: { status: 'complete', confidence: 0.94, page: 11, snippets: [] }
}];

function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
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
    const url = new URL(route.request().url());
    if (url.pathname === '/api/health') return json(route, health);
    if (url.pathname === '/api/status') return json(route, { status: 'operational' });
    if (url.pathname === '/api/privacy/me') return json(route, profile);
    if (url.pathname === '/api/uploads') return json(route, { uploads });
    if (url.pathname === '/api/shares') return json(route, { shares: [{ id: 'share-1', label: 'Clinician review', expiresAt: '2026-07-19T11:24:00.000Z', revokedAt: null }] });
    if (url.pathname === '/api/labs/explain') return json(route, { results: [] });
    return json(route, {});
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({ viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  if (result.documentWidth > result.viewport + 1 || result.bodyWidth > result.viewport + 1) throw new Error(`${label} horizontal overflow: ${JSON.stringify(result)}`);
}

let browser;
let previewServer;
try {
  await fs.mkdir(outputDir, { recursive: true });
  previewServer = await startVitePreview({ root, preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await installMocks(page);
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

  await page.getByText('Chest pain in a 62-year-old male', { exact: true }).click();
  await page.getByText('Cardiac ischemia', { exact: false }).waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(page, 'chat desktop');
  if (!(await page.locator('.assistant-control-rail').isVisible())) throw new Error('Desktop assistant control rail is not visible');
  await page.screenshot({ path: path.join(outputDir, 'ui-chat-desktop.png'), fullPage: false });

  await page.locator('.primary-nav').getByRole('button', { name: 'Evidence' }).click();
  await page.locator('.evidence-workspace').waitFor({ state: 'visible' });
  await page.getByText('ESC-NSTE-ACS-Guideline.pdf', { exact: true }).first().waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(page, 'evidence desktop');
  await page.screenshot({ path: path.join(outputDir, 'ui-evidence-desktop.png'), fullPage: false });

  await page.locator('.primary-nav').getByRole('button', { name: 'Chat' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await assertNoHorizontalOverflow(page, 'mobile');
  if (await page.locator('.assistant-control-rail').isVisible()) throw new Error('Desktop assistant control rail should be hidden on mobile');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outputDir, 'ui-mobile.png'), fullPage: false });

  console.log('Visual smoke test passed: chat, evidence and mobile screenshots captured without horizontal overflow.');
} finally {
  await browser?.close();
  if (previewServer?.httpServer) await new Promise((resolve) => previewServer.httpServer.close(resolve));
}
