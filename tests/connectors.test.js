import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRss } from '../server/connectors/index.js';
import { stripMarkup } from '../server/lib/http.js';

test('RSS parser normalizes guideline feed items', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><guid>abc</guid><title>Updated diabetes guideline</title><description><![CDATA[<p>New monitoring section</p>]]></description><link>https://example.org/guideline</link><pubDate>Wed, 01 Jul 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
  const [item] = parseRss(xml, 'who-guidelines');
  assert.equal(item.source, 'who-guidelines');
  assert.equal(item.title, 'Updated diabetes guideline');
  assert.equal(item.content, 'New monitoring section');
  assert.equal(item.evidenceTier, 1);
  assert.match(item.reviewStatus, /review/);
});

test('markup stripping removes scripts and decodes entities', () => {
  assert.equal(stripMarkup('<p>A &amp; B</p><script>alert(1)</script>'), 'A & B');
});
