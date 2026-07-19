const NEGATIVE_TERMS = [
  'not recommended', 'contraindicated', 'avoid', 'do not use', 'không khuyến cáo', 'chống chỉ định', 'tránh dùng'
];
const POSITIVE_TERMS = [
  'recommended', 'should use', 'first line', 'preferred', 'khuyến cáo', 'nên dùng', 'ưu tiên', 'hàng đầu'
];

function stance(document) {
  const text = `${document.title || ''} ${document.abstract || ''} ${document.content || ''}`.toLowerCase();
  const negative = NEGATIVE_TERMS.some((term) => text.includes(term));
  const positive = POSITIVE_TERMS.some((term) => text.includes(term));
  if (negative && !positive) return 'negative';
  if (positive && !negative) return 'positive';
  if (negative && positive) return 'mixed';
  return 'neutral';
}

export function resolveEvidenceConflicts(documents = []) {
  const authoritative = documents.filter((item) => item.evidenceTier <= 1 && ['approved', 'curated-baseline'].includes(item.reviewStatus));
  const conflicts = [];

  for (let index = 0; index < authoritative.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < authoritative.length; otherIndex += 1) {
      const left = authoritative[index];
      const right = authoritative[otherIndex];
      const sharedDiseases = (left.diseaseIds || []).filter((id) => (right.diseaseIds || []).includes(id));
      const sameCategory = left.category && left.category === right.category;
      if (!sharedDiseases.length && !sameCategory) continue;
      const leftStance = stance(left);
      const rightStance = stance(right);
      const opposite = new Set([leftStance, rightStance]).has('positive') && new Set([leftStance, rightStance]).has('negative');
      const jurisdictionMismatch = left.jurisdiction && right.jurisdiction && left.jurisdiction !== right.jurisdiction;
      if (!opposite && !jurisdictionMismatch) continue;
      conflicts.push({
        type: opposite ? 'recommendation-conflict' : 'jurisdiction-difference',
        diseaseIds: sharedDiseases,
        category: left.category || right.category || 'general',
        documents: [
          { id: left.id, title: left.title, source: left.source, jurisdiction: left.jurisdiction, stance: leftStance, updatedAt: left.updatedAt },
          { id: right.id, title: right.title, source: right.source, jurisdiction: right.jurisdiction, stance: rightStance, updatedAt: right.updatedAt }
        ],
        instruction: 'Present both sources separately. Do not blend them into one recommendation.'
      });
    }
  }

  return conflicts.slice(0, 20);
}
