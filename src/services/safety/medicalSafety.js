const EMERGENCY_PATTERNS = [
  {
    id: 'chest-pain',
    severity: 'emergency',
    patterns: [
      /\b(chest pain|pressure in (my|the) chest|crushing chest pain)\b/i,
      /\b(đau ngực|tức ngực|nặng ngực)\b/i
    ]
  },
  {
    id: 'breathing',
    severity: 'emergency',
    patterns: [
      /\b(can(?:not|'t) breathe|difficulty breathing|shortness of breath|choking)\b/i,
      /\b(khó thở|không thở được|nghẹt thở)\b/i
    ]
  },
  {
    id: 'stroke',
    severity: 'emergency',
    patterns: [
      /\b(face droop|slurred speech|sudden weakness|one-sided weakness|possible stroke)\b/i,
      /\b(méo miệng|nói đớ|yếu một bên|liệt nửa người|đột quỵ)\b/i
    ]
  },
  {
    id: 'severe-bleeding',
    severity: 'emergency',
    patterns: [
      /\b(severe bleeding|bleeding (will not|won't) stop|coughing blood|vomiting blood)\b/i,
      /\b(chảy máu nhiều|máu không cầm|ho ra máu|nôn ra máu)\b/i
    ]
  },
  {
    id: 'unconsciousness',
    severity: 'emergency',
    patterns: [
      /\b(unconscious|not waking up|passed out and not responding|seizure lasting)\b/i,
      /\b(bất tỉnh|không tỉnh lại|không phản ứng|co giật kéo dài)\b/i
    ]
  },
  {
    id: 'self-harm',
    severity: 'crisis',
    patterns: [
      /\b(kill myself|end my life|suicide|hurt myself|self[- ]harm)\b/i,
      /\b(tự tử|kết liễu|muốn chết|tự làm hại bản thân)\b/i
    ]
  }
];

const NEGATION_PATTERNS = [
  /\b(no|not|never|without|deny|denies|do not|don't|does not|doesn't)\b/i,
  /\b(không|chưa|không có|không bị|phủ nhận)\b/i
];

const INFORMATIONAL_PATTERNS = [
  /\b(what is|what are|tell me about|information about|symptoms of|definition of)\b/i,
  /\b(là gì|thông tin về|triệu chứng của|giải thích về)\b/i
];

function hasNearbyNegation(text, matchIndex) {
  const contextStart = Math.max(0, matchIndex - 32);
  const context = text.slice(contextStart, matchIndex);
  return NEGATION_PATTERNS.some((pattern) => pattern.test(context));
}

export function assessMedicalSafety(input = '') {
  const text = String(input).trim();

  if (!text) {
    return { level: 'normal', matchedSignals: [] };
  }

  const matchedSignals = [];

  for (const signal of EMERGENCY_PATTERNS) {
    for (const pattern of signal.patterns) {
      const match = pattern.exec(text);
      if (match && !hasNearbyNegation(text, match.index)) {
        matchedSignals.push({ id: signal.id, severity: signal.severity });
        break;
      }
    }
  }

  if (matchedSignals.length === 0) {
    return { level: 'normal', matchedSignals: [] };
  }

  const isInformational = INFORMATIONAL_PATTERNS.some((pattern) => pattern.test(text));
  const hasFirstPersonContext = /\b(i|i'm|im|my|me|tôi|mình|em|con|cháu)\b/i.test(text);

  if (isInformational && !hasFirstPersonContext) {
    return { level: 'normal', matchedSignals: [] };
  }

  const level = matchedSignals.some((signal) => signal.severity === 'crisis')
    ? 'crisis'
    : 'emergency';

  return { level, matchedSignals };
}

export function buildSafetyResponse(assessment, locale = 'en') {
  const isVietnamese = locale === 'vi';

  if (assessment.level === 'crisis') {
    return isVietnamese
      ? `**Bạn có thể đang gặp khủng hoảng và cần hỗ trợ ngay.**\n\n- Hãy gọi số cấp cứu tại nơi bạn đang ở hoặc đến khoa cấp cứu gần nhất.\n- Ở bên một người bạn tin tưởng và tránh ở một mình.\n- Rời xa thuốc, vũ khí hoặc bất kỳ vật dụng nào có thể gây hại.\n\nTôi không thể xử lý tình huống khẩn cấp, nhưng sự an toàn của bạn là ưu tiên ngay lúc này.`
      : `**You may be in a crisis and need immediate human support.**\n\n- Call your local emergency number or go to the nearest emergency department now.\n- Stay with someone you trust and avoid being alone.\n- Move away from medicines, weapons, or anything you could use to harm yourself.\n\nI cannot manage an emergency, but your immediate safety matters most.`;
  }

  return isVietnamese
    ? `**Các triệu chứng bạn mô tả có thể là tình trạng cấp cứu.**\n\n- Hãy gọi số cấp cứu tại nơi bạn đang ở hoặc đến khoa cấp cứu gần nhất ngay bây giờ.\n- Không tự lái xe nếu bạn đang choáng, khó thở, đau ngực, yếu liệt hoặc chảy máu nhiều.\n- Làm theo hướng dẫn của nhân viên cấp cứu và không trì hoãn để chờ phản hồi từ AI.\n\nTôi không thể chẩn đoán hoặc loại trừ tình trạng nguy hiểm qua trò chuyện.`
    : `**The symptoms you described may represent a medical emergency.**\n\n- Call your local emergency number or go to the nearest emergency department now.\n- Do not drive yourself if you are faint, short of breath, having chest pain, weak on one side, or bleeding heavily.\n- Follow emergency-dispatch instructions and do not delay care while waiting for an AI response.\n\nI cannot diagnose or rule out a dangerous condition through chat.`;
}

export function detectLocale(input = '') {
  return /[ăâđêôơưĂÂĐÊÔƠƯ]|\b(tôi|mình|em|không|đau|khó thở|triệu chứng)\b/i.test(String(input))
    ? 'vi'
    : 'en';
}
