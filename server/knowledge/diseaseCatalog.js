import catalogPart1 from './diseaseCatalogData1.js';
import catalogPart2 from './diseaseCatalogData2.js';
import catalogPart3 from './diseaseCatalogData3.js';

const RAW_CATALOG = [catalogPart1, catalogPart2, catalogPart3].join('\n');

function splitList(value = '') {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

export const diseaseCatalog = RAW_CATALOG.split('\n').map((line) => {
  const [id, name, nameVi, category, aliases, symptoms, redFlags, riskFactors, comorbidities, monitoring] = line.split('~');
  return {
    id,
    name,
    nameVi,
    category,
    aliases: [...new Set([name, nameVi, ...splitList(aliases)])],
    symptoms: splitList(symptoms),
    redFlags: splitList(redFlags),
    riskFactors: splitList(riskFactors),
    comorbidities: splitList(comorbidities),
    monitoring: splitList(monitoring)
  };
});

export function diseaseToDocument(item) {
  return {
    id: `disease:${item.id}`,
    source: 'curated-disease-catalog',
    sourceType: 'curated',
    title: `${item.name} / ${item.nameVi}`,
    content: [
      `Condition: ${item.name} (${item.nameVi}).`,
      `Category: ${item.category}.`,
      item.aliases.length ? `Aliases: ${item.aliases.join(', ')}.` : '',
      item.symptoms.length ? `Common features: ${item.symptoms.join(', ')}.` : '',
      item.redFlags.length ? `Red flags: ${item.redFlags.join(', ')}.` : '',
      item.riskFactors.length ? `Risk factors: ${item.riskFactors.join(', ')}.` : '',
      item.comorbidities.length ? `Common comorbidities or interactions: ${item.comorbidities.join(', ')}.` : '',
      item.monitoring.length ? `Monitoring domains: ${item.monitoring.join(', ')}.` : ''
    ].filter(Boolean).join('\n'),
    aliases: item.aliases,
    diseaseIds: [item.id],
    category: item.category,
    evidenceTier: 1,
    reviewStatus: 'curated-baseline',
    jurisdiction: 'general',
    sourceVersion: 'catalog-v1',
    publishedAt: null,
    retrievedAt: new Date().toISOString(),
    canonicalUrl: null
  };
}
