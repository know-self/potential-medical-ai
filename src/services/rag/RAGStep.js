import KnowledgeBase from './KnowledgeBase.js';

function formatEvidence(result) {
  const lines = [];
  for (const [index, item] of (result.results || []).entries()) {
    const source = item.source || 'unknown source';
    const date = item.updatedAt || item.publishedAt || item.retrievedAt || 'date unavailable';
    const status = item.reviewStatus || 'unreviewed';
    lines.push(`[${index + 1}] ${item.title}\nSource: ${source}; date: ${date}; evidence tier: ${item.evidenceTier}; review: ${status}\n${item.abstract || item.content || ''}`);
  }
  if (result.detectedDiseases?.length) {
    lines.unshift(`Detected condition concepts: ${result.detectedDiseases.map((item) => `${item.name} (${item.nameVi})`).join(', ')}`);
  }
  return lines.join('\n\n');
}

export class RAGStep {
  constructor() {
    this.knowledgeBase = new KnowledgeBase();
    this.isInitialized = false;
  }

  async initialize() {
    await this.knowledgeBase.initialize();
    this.isInitialized = true;
  }

  async retrieveKnowledgeContext(query, topK = 6) {
    if (!this.isInitialized) throw new Error('RAG Step not initialized');
    const payload = await this.knowledgeBase.searchRelevantInfo(query, topK);
    return {
      source: 'medical-knowledge-api',
      results: payload.results || [],
      detectedDiseases: payload.detectedDiseases || [],
      context: formatEvidence(payload),
      relevance: payload.results?.length ? 'high' : 'low',
      timestamp: Date.now(),
      error: payload.error
    };
  }

  async generateRAGContext(query, conversationHistory = []) {
    try {
      const knowledgeResult = await this.retrieveKnowledgeContext(query);
      const recentHistory = conversationHistory.slice(-4).map((message) => `${message.role}: ${message.content}`).join('\n');
      const combinedContext = [
        knowledgeResult.context ? `MEDICAL EVIDENCE:\n${knowledgeResult.context}` : '',
        recentHistory ? `RECENT CONVERSATION:\n${recentHistory}` : ''
      ].filter(Boolean).join('\n\n');
      return {
        success: true,
        knowledgeContext: knowledgeResult,
        pubmedData: {
          source: 'pubmed',
          data: knowledgeResult.results.filter((item) => item.source === 'pubmed'),
          relevance: knowledgeResult.results.some((item) => item.source === 'pubmed') ? 'high' : 'low'
        },
        citations: knowledgeResult.results.map((item, index) => ({
          number: index + 1,
          title: item.title,
          source: item.source,
          url: item.canonicalUrl,
          publishedAt: item.publishedAt,
          updatedAt: item.updatedAt,
          evidenceTier: item.evidenceTier,
          reviewStatus: item.reviewStatus
        })),
        detectedDiseases: knowledgeResult.detectedDiseases,
        combinedContext,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        knowledgeContext: { results: [], detectedDiseases: [], context: '' },
        pubmedData: { source: 'pubmed', data: [], relevance: 'low' },
        citations: [],
        detectedDiseases: [],
        combinedContext: '',
        timestamp: Date.now()
      };
    }
  }

  getRAGStats() {
    return {
      knowledgeBase: this.knowledgeBase.getStats(),
      isInitialized: this.isInitialized
    };
  }

  isReady() {
    return this.isInitialized && this.knowledgeBase.isReady();
  }
}
