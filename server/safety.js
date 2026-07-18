const SIGNALS = [
  ['chest-pain', 'emergency', /\b(chest pain|pressure in (my|the) chest|crushing chest pain)\b|đau ngực|tức ngực|nặng ngực/i],
  ['breathing', 'emergency', /\b(can(?:not|'t) breathe|difficulty breathing|shortness of breath|choking)\b|khó thở|không thở được|nghẹt thở/i],
  ['stroke', 'emergency', /\b(face droop|slurred speech|sudden weakness|one-sided weakness|possible stroke)\b|méo miệng|nói đớ|yếu một bên|liệt nửa người|đột quỵ/i],
  ['severe-bleeding', 'emergency', /\b(severe bleeding|bleeding (will not|won't) stop|coughing blood|vomiting blood)\b|chảy máu nhiều|máu không cầm|ho ra máu|nôn ra máu/i],
  ['unconsciousness', 'emergency', /\b(unconscious|not waking up|passed out and not responding|seizure lasting)\b|bất tỉnh|không tỉnh lại|không phản ứng|co giật kéo dài/i],
  ['self-harm', 'crisis', /\b(kill myself|end my life|suicide|hurt myself|self[- ]harm)\b|tự tử|kết liễu|muốn chết|tự làm hại bản thân/i]
];

const NEGATION = /\b(no|not|never|without|deny|denies|do not|don't|does not|doesn't)\b|không có|không bị|chưa từng|phủ nhận/i;
const INFORMATIONAL = /\b(what is|what are|tell me about|information about|symptoms of|definition of)\b|là gì|thông tin về|triệu chứng của|giải thích về/i;
const FIRST_PERSON = /\b(i|i'm|im|my|me)\b|tôi|mình|em|con|cháu/i;

function nearbyNegation(text, matchIndex) {
  return NEGATION.test(text.slice(Math.max(0, matchIndex - 40), matchIndex));
}

export function assessMedicalSafety(input = '') {
  const text = String(input).trim();
  if (!text) return { level: 'normal', matchedSignals: [] };
  const matchedSignals = [];
  for (const [id, severity, pattern] of SIGNALS) {
    const match = pattern.exec(text);
    if (match && !nearbyNegation(text, match.index)) matchedSignals.push({ id, severity });
  }
  if (!matchedSignals.length) return { level: 'normal', matchedSignals: [] };
  if (INFORMATIONAL.test(text) && !FIRST_PERSON.test(text)) return { level: 'normal', matchedSignals: [] };
  return {
    level: matchedSignals.some((signal) => signal.severity === 'crisis') ? 'crisis' : 'emergency',
    matchedSignals
  };
}

export function detectLocale(input = '') {
  return /[ăâđêôơưĂÂĐÊÔƠƯ]|tôi|mình|không|đau|triệu chứng/i.test(String(input)) ? 'vi' : 'en';
}

export function buildSafetyResponse(assessment, locale = 'en') {
  const vi = locale === 'vi';
  if (assessment.level === 'crisis') {
    return vi
      ? '**Bạn có thể đang gặp khủng hoảng và cần hỗ trợ ngay.**\n\n- Gọi số cấp cứu tại nơi bạn đang ở hoặc đến khoa cấp cứu gần nhất.\n- Ở cùng một người đáng tin cậy và tránh ở một mình.\n- Rời xa thuốc, vũ khí hoặc vật dụng có thể gây hại.\n\nĐừng chờ phản hồi từ AI trước khi tìm hỗ trợ trực tiếp.'
      : '**You may be in a crisis and need immediate human support.**\n\n- Call your local emergency number or go to the nearest emergency department.\n- Stay with someone you trust and avoid being alone.\n- Move away from medicines, weapons, or anything you could use to harm yourself.\n\nDo not wait for an AI response before seeking direct help.';
  }
  return vi
    ? '**Các triệu chứng bạn mô tả có thể là tình trạng cấp cứu.**\n\n- Gọi số cấp cứu tại nơi bạn đang ở hoặc đến khoa cấp cứu gần nhất ngay bây giờ.\n- Không tự lái xe nếu bạn choáng, khó thở, đau ngực, yếu liệt hoặc chảy máu nhiều.\n- Không trì hoãn để chờ phản hồi từ AI.'
    : '**The symptoms you described may represent a medical emergency.**\n\n- Call your local emergency number or go to the nearest emergency department now.\n- Do not drive yourself if you are faint, short of breath, having chest pain, weak on one side, or bleeding heavily.\n- Do not delay care while waiting for an AI response.';
}
