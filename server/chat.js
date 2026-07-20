import { consumeTenantBudget } from './capacity.js';
import { knowledgePlane } from './knowledgeClient.js';
import { generateRoutedResponse } from './modelRouter.js';
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

function evidenceText(knowledge) {
  return knowledge.results.slice(0, 8).map((item, index) => [
    `[${index + 1}] ${item.title}`,
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
  if (!attachments.length) return 'No uploaded evidence supplied.';
  return attachments.slice(0, 8).map((item, index) => [
    `Attachment ${index + 1}: ${item.filename || item.id}`,
    `Extraction status: ${item.extraction?.status || 'unknown'}; confidence: ${item.extraction?.confidence ?? 'unknown'}`,
    item.extraction?.text || 'No extractable text.',
    item.extraction?.warning || ''
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function buildEvidencePrompt({ question, history = [], knowledge, patientContext = null, attachments = [] }) {
  const detected = (knowledge.detectedDiseases || []).map((item) => `${item.name} (${item.nameVi})`).join(', ');
  const recentHistory = history.slice(-8).map((item) => `${item.role}: ${item.content}`).join('\n');
  const contextText = patientContext
    ? JSON.stringify(patientContext, null, 2)
    : 'No user-confirmed structured context supplied.';
  return `You are the conversational assistant in a medical information chat platform.\n\nRules:\n- Use only the evidence below for medical claims; the evidence is versioned and provenance-tracked.\n- Distinguish official guidance and labels from research candidates and trials.\n- Never convert a single study, adverse-event report, or trial listing into a treatment recommendation.\n- Do not diagnose, prescribe, or provide individualized dosing.\n- User-provided context is unverified and must not silently become a diagnosis.\n- State uncertainty and recommend a qualified clinician for decisions.\n- Keep citation markers [1], [2], etc. attached to supported claims.\n- Explicitly surface evidence or jurisdiction conflicts instead of blending them.\n- Treat uploaded extraction as source material with its stated confidence, not as verified truth.\n- If evidence is insufficient, say so instead of relying on model memory.\n\nKnowledge freshness: ${knowledge.freshness?.level || 'unknown'}; checked at ${knowledge.freshness?.checkedAt || 'unknown'}\nLocale routing: ${knowledge.localeRouting?.locale || 'unknown'}; preferred jurisdiction: ${knowledge.localeRouting?.preferredJurisdiction || 'unknown'}\nDetected conditions/comorbidities: ${detected || 'none'}\n\nUser-confirmed structured context:\n${contextText}\n\nEvidence conflicts:\n${conflictText(knowledge.conflicts)}\n\nVersioned evidence:\n${evidenceText(knowledge) || 'No matching evidence.'}\n\nUploaded evidence:\n${attachmentText(attachments)}\n\nRecent conversation:\n${recentHistory || 'none'}\n\nCurrent question: ${question}`;
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
    ? `\n\n**Evidence conflicts detected:** ${conflicts.length}. The answer should present conflicting jurisdictions or recommendations separately.`
    : '';
  return `\n\n### Evidence sources\n${lines.join('\n') || 'No source matched.'}${conflictNote}\n\n**Knowledge freshness:** ${freshness?.level || 'unknown'} (checked ${freshness?.checkedAt || 'unknown'}).\n\n**Safety note:** General information only; diagnosis and treatment decisions require a qualified healthcare professional.`;
}

export async function streamMedicalChat(body, response, context = {}) {
  const question = String(body.message || body.question || '').trim();
  if (!question) throw new Error('message is required');
  const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const attachments = Array.isArray(context.attachments) ? context.attachments : [];
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
    sse(response, { type: 'done', safety, citations: [], freshness: null }, 'done');
    response.end();
    return;
  }

  try {
    const locale = body.locale || detectLocale(question);
    const knowledge = await knowledgePlane.search(question, { limit: 8, maxEvidenceTier: 4, locale });
    const citations = citationLines(knowledge.results);
    const prompt = buildEvidencePrompt({
      question,
      history,
      knowledge,
      patientContext: context.patientContext || null,
      attachments
    });
    const generated = await generateRoutedResponse({
      prompt,
      question,
      knowledge,
      attachments,
      onChunk: (chunk) => sse(response, { type: 'chunk', text: chunk }, 'chunk')
    });

    const appendix = sourceAppendix(citations, knowledge.freshness, knowledge.conflicts);
    sse(response, { type: 'chunk', text: appendix }, 'chunk');
    sse(response, {
      type: 'done',
      safety,
      citations,
      freshness: knowledge.freshness,
      conflicts: knowledge.conflicts || [],
      terminology: knowledge.terminology || null,
      detectedDiseases: knowledge.detectedDiseases || [],
      generatedCharacters: generated.text.length,
      provider: generated.provider,
      model: generated.model,
      cached: generated.cached,
      task: generated.task
    }, 'done');
    response.end();
  } catch (error) {
    const text = error.code === 'KNOWLEDGE_STALE' || /stale|synchron/i.test(error.message)
      ? 'Nguồn kiến thức y khoa bắt buộc đang cũ hoặc chưa đồng bộ. Hệ thống đã dừng trả lời y khoa thay vì sử dụng kiến thức không còn mới. Vui lòng thử lại sau khi knowledge plane đồng bộ thành công.'
      : 'Nền tảng kiến thức hoặc mô hình đang tạm thời không khả dụng. Hệ thống không sử dụng kiến thức cục bộ để trả lời thay thế.';
    sse(response, { type: 'chunk', text }, 'chunk');
    sse(response, { type: 'error', error: error.message }, 'error');
    response.end();
  }
}
