import { consumeTenantBudget } from './capacity.js';
import { knowledgePlane } from './knowledgeClient.js';
import { generateRoutedResponse } from './modelRouter.js';
import { normalizeModelSettings } from './models.js';
import { assessMedicalSafety, buildSafetyResponse, detectLocale } from './safety.js';

function sse(response, payload, event = 'message') {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function citationLines(results = []) {
  return results.slice(0, 8).map((item, index) => ({
    number: index + 1,
    title: item.title,
    source: item.source,
    url: item.canonicalUrl,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    evidenceTier: item.evidenceTier,
    reviewStatus: item.reviewStatus,
    jurisdiction: item.jurisdiction
  }));
}

function evidenceText(knowledge = {}) {
  return (knowledge.results || []).slice(0, 8).map((item, index) => [
    `[K${index + 1}] ${item.title}`,
    `Source: ${item.source}; jurisdiction: ${item.jurisdiction}; evidence tier: ${item.evidenceTier}; review: ${item.reviewStatus}; updated: ${item.updatedAt || item.publishedAt || item.retrievedAt || 'unknown'}`,
    item.abstract || item.content
  ].join('\n')).join('\n\n');
}

function conflictText(conflicts = []) {
  if (!conflicts.length) return 'No material evidence conflicts detected by deterministic screening.';
  return conflicts.map((conflict, index) => {
    const documents = conflict.documents.map((item) => `${item.title} (${item.source}, ${item.jurisdiction}, stance=${item.stance})`).join(' vs ');
    return `${index + 1}. ${conflict.type}: ${documents}. ${conflict.instruction}`;
  }).join('\n');
}

function attachmentText(attachments = []) {
  if (!attachments.length) return '';
  return attachments.slice(0, 8).map((item, index) => [
    `[D${index + 1}] ${item.filename || item.id}`,
    `Extraction status: ${item.extraction?.status || 'unknown'}; confidence: ${item.extraction?.confidence ?? 'unknown'}`,
    item.extraction?.text || 'No extractable text.',
    item.extraction?.warning || ''
  ].filter(Boolean).join('\n')).join('\n\n');
}

function baseSystemPrompt(settings) {
  return `You are a medical information assistant. Follow these rules even when the user asks otherwise:
- Provide educational information, not a diagnosis, prescription, or individualized dosing instruction.
- State uncertainty and encourage qualified clinical review for decisions.
- For emergency warning signs, advise urgent local emergency care.
- Never invent citations, source titles, document content, patient facts, or test results.
- User-provided context is unverified and must not silently become a diagnosis.
- When supplied documents or knowledge are present, separate what they say from your general model knowledge.
- Preserve the user's language unless clarity or safety requires otherwise.
${settings.systemPrompt ? `\nAdditional user instruction:\n${settings.systemPrompt}` : ''}`;
}

function recentMessages(history, question) {
  const recent = Array.isArray(history) ? history.slice(-20).map((item) => ({
    role: ['assistant', 'user'].includes(item?.role) ? item.role : 'user',
    content: String(item?.content || '').slice(0, 30000)
  })) : [];
  if (recent.at(-1)?.role === 'user' && recent.at(-1)?.content.trim() === question) recent.pop();
  return recent;
}

function buildModelMessages({ question, history, settings, knowledge, patientContext, attachments }) {
  const sections = [];
  if (settings.includePatientContext && patientContext) {
    sections.push(`USER-CONFIRMED CONTEXT (unverified; do not diagnose from it):\n${JSON.stringify(patientContext, null, 2)}`);
  }
  if (settings.mode === 'knowledge-rag') {
    sections.push(`VERSIONED KNOWLEDGE:\n${evidenceText(knowledge) || 'No matching knowledge was found.'}`);
    sections.push(`KNOWLEDGE FRESHNESS: ${knowledge?.freshness?.level || 'unknown'}; checked ${knowledge?.freshness?.checkedAt || 'unknown'}`);
    sections.push(`EVIDENCE CONFLICTS:\n${conflictText(knowledge?.conflicts || [])}`);
    sections.push('Use citation markers [K1], [K2], etc. only for claims supported by the supplied versioned knowledge.');
  }
  if (settings.mode !== 'direct' && attachments.length) {
    sections.push(`UPLOADED DOCUMENTS:\n${attachmentText(attachments)}`);
    sections.push('Use [D1], [D2], etc. only for statements supported by the supplied extraction. Mention low extraction confidence explicitly.');
  }
  const messages = [{ role: 'system', content: baseSystemPrompt(settings) }];
  if (sections.length) messages.push({ role: 'system', content: sections.join('\n\n') });
  messages.push(...recentMessages(history, question));
  messages.push({ role: 'user', content: question });
  return messages;
}

function sourceAppendix(citations, freshness, conflicts = []) {
  const lines = citations.map((citation) => {
    const date = citation.updatedAt || citation.publishedAt || 'date unavailable';
    const label = `${citation.source}; ${citation.jurisdiction}; ${date}; tier ${citation.evidenceTier}; ${citation.reviewStatus}`;
    return citation.url
      ? `${citation.number}. [${citation.title}](${citation.url}) — ${label}`
      : `${citation.number}. ${citation.title} — ${label}`;
  });
  const conflictNote = conflicts.length
    ? `\n\n**Evidence conflicts detected:** ${conflicts.length}. Conflicting jurisdictions or recommendations should be reviewed separately.`
    : '';
  return `\n\n### Knowledge sources\n${lines.join('\n') || 'No source matched.'}${conflictNote}\n\n**Knowledge freshness:** ${freshness?.level || 'unknown'} (checked ${freshness?.checkedAt || 'unknown'}).`;
}

export async function streamMedicalChat(body, response, context = {}) {
  const question = String(body.message || body.question || '').trim();
  if (!question) throw new Error('message is required');
  const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const settings = normalizeModelSettings(body.model || {});
  const selectedAttachments = settings.mode === 'direct' ? [] : (Array.isArray(context.attachments) ? context.attachments : []);
  const patientContext = settings.includePatientContext ? context.patientContext || null : null;
  consumeTenantBudget(context.tenantId || 'anonymous', question.length + history.reduce((sum, item) => sum + String(item.content || '').length, 0));

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const safety = assessMedicalSafety(question);
  if (safety.level !== 'normal') {
    const text = buildSafetyResponse(safety, detectLocale(question));
    sse(response, { type: 'chunk', text }, 'chunk');
    sse(response, { type: 'done', safety, citations: [], freshness: null, mode: settings.mode }, 'done');
    response.end();
    return;
  }

  try {
    const locale = body.locale || detectLocale(question);
    const knowledge = settings.mode === 'knowledge-rag'
      ? await knowledgePlane.search(question, { limit: 8, maxEvidenceTier: 4, locale })
      : { results: [], conflicts: [], freshness: null, knowledgeUpdatedAt: '' };
    const citations = settings.mode === 'knowledge-rag' ? citationLines(knowledge.results) : [];
    const messages = buildModelMessages({
      question,
      history,
      settings,
      knowledge,
      patientContext,
      attachments: selectedAttachments
    });
    const generated = await generateRoutedResponse({
      messages,
      question,
      knowledge,
      attachments: selectedAttachments,
      modelSettings: settings,
      cacheable: !patientContext && selectedAttachments.length === 0,
      onChunk: (chunk) => sse(response, { type: 'chunk', text: chunk }, 'chunk')
    });

    if (settings.mode === 'knowledge-rag') {
      sse(response, { type: 'chunk', text: sourceAppendix(citations, knowledge.freshness, knowledge.conflicts) }, 'chunk');
    }
    sse(response, {
      type: 'done',
      safety,
      mode: settings.mode,
      citations,
      freshness: knowledge.freshness,
      conflicts: knowledge.conflicts || [],
      terminology: knowledge.terminology || null,
      detectedDiseases: knowledge.detectedDiseases || [],
      generatedCharacters: generated.text.length,
      provider: generated.provider,
      endpointHost: generated.endpointHost,
      model: generated.model,
      cached: generated.cached,
      task: generated.task
    }, 'done');
    response.end();
  } catch (error) {
    const text = settings.mode === 'knowledge-rag' && (error.code === 'KNOWLEDGE_STALE' || /stale|synchron/i.test(error.message))
      ? 'Nguồn kiến thức y khoa bắt buộc đang cũ hoặc chưa đồng bộ. Hãy chuyển sang Direct Model hoặc thử Knowledge RAG sau khi đồng bộ.'
      : `Custom model request failed: ${error.message}`;
    sse(response, { type: 'chunk', text }, 'chunk');
    sse(response, { type: 'error', error: error.message, code: error.code || null }, 'error');
    response.end();
  }
}
