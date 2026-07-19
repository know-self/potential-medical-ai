import { config } from './config.js';
import { knowledgePlane } from './knowledgeClient.js';
import { generateGoogle, streamOpenRouterChunks } from './models.js';
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
    reviewStatus: item.reviewStatus
  }));
}

function evidenceText(knowledge) {
  return knowledge.results.slice(0, 8).map((item, index) => [
    `[${index + 1}] ${item.title}`,
    `Source: ${item.source}; evidence tier: ${item.evidenceTier}; review: ${item.reviewStatus}; updated: ${item.updatedAt || item.publishedAt || item.retrievedAt || 'unknown'}`,
    item.abstract || item.content
  ].join('\n')).join('\n\n');
}

export function buildEvidencePrompt({ question, history = [], knowledge }) {
  const detected = (knowledge.detectedDiseases || []).map((item) => `${item.name} (${item.nameVi})`).join(', ');
  const recentHistory = history.slice(-8).map((item) => `${item.role}: ${item.content}`).join('\n');
  return `You are an evidence-grounded healthcare information assistant.\n\nRules:\n- Use only the evidence below for medical claims.\n- Distinguish official guidance/labels from research candidates and trials.\n- Never convert a single study, adverse-event report, or trial listing into a treatment recommendation.\n- Do not diagnose, prescribe, or provide individualized dosing.\n- State uncertainty and recommend a qualified clinician for decisions.\n- Keep citation markers [1], [2], etc. attached to supported claims.\n- If evidence is insufficient, say so instead of relying on memory.\n\nKnowledge freshness: ${knowledge.freshness?.level || 'unknown'}; checked at ${knowledge.freshness?.checkedAt || 'unknown'}\nDetected conditions/comorbidities: ${detected || 'none'}\n\nVersioned evidence:\n${evidenceText(knowledge) || 'No matching evidence.'}\n\nRecent conversation:\n${recentHistory || 'none'}\n\nCurrent question: ${question}`;
}

function sourceAppendix(citations, freshness) {
  const lines = citations.map((citation) => {
    const date = citation.updatedAt || citation.publishedAt || 'date unavailable';
    const label = `${citation.source}; ${date}; tier ${citation.evidenceTier}; ${citation.reviewStatus}`;
    return citation.url
      ? `${citation.number}. [${citation.title}](${citation.url}) — ${label}`
      : `${citation.number}. ${citation.title} — ${label}`;
  });
  return `\n\n### Evidence sources\n${lines.join('\n') || 'No source matched.'}\n\n**Knowledge freshness:** ${freshness?.level || 'unknown'} (checked ${freshness?.checkedAt || 'unknown'}).\n\n**Safety note:** General information only; diagnosis and treatment decisions require a qualified healthcare professional.`;
}

export async function streamMedicalChat(body, response) {
  const question = String(body.message || body.question || '').trim();
  if (!question) throw new Error('message is required');
  const history = Array.isArray(body.history) ? body.history.slice(-20) : [];

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
    const knowledge = await knowledgePlane.search(question, { limit: 8, maxEvidenceTier: 4 });
    const citations = citationLines(knowledge.results);
    const prompt = buildEvidencePrompt({ question, history, knowledge });
    let generated = '';

    if (config.openRouter.apiKey) {
      generated = await streamOpenRouterChunks({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.15,
        maxTokens: 5000
      }, (chunk) => sse(response, { type: 'chunk', text: chunk }, 'chunk'));
    } else if (config.google.apiKey) {
      const result = await generateGoogle({ prompt, temperature: 0.15, maxTokens: 5000 });
      generated = result.text;
      sse(response, { type: 'chunk', text: generated }, 'chunk');
    } else {
      throw new Error('No server-side model is configured');
    }

    const appendix = sourceAppendix(citations, knowledge.freshness);
    sse(response, { type: 'chunk', text: appendix }, 'chunk');
    sse(response, {
      type: 'done',
      safety,
      citations,
      freshness: knowledge.freshness,
      detectedDiseases: knowledge.detectedDiseases || [],
      generatedCharacters: generated.length
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
