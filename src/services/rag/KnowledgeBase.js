import { medicalApi } from '../apiClient.js';

class KnowledgeBase {
  constructor() {
    this.status = null;
    this.lastResults = [];
    this.initialized = false;
  }

  async initialize() {
    try {
      this.status = await medicalApi.knowledgeStatus();
      this.initialized = true;
      return true;
    } catch (error) {
      console.warn('Medical knowledge API is unavailable:', error.message);
      this.status = { totalDocuments: 0, diseaseProfiles: 0, degraded: true };
      this.initialized = true;
      return false;
    }
  }

  async searchRelevantInfo(query, topK = 6) {
    try {
      const payload = await medicalApi.searchKnowledge(query, topK);
      this.lastResults = payload.results || [];
      return {
        results: this.lastResults,
        detectedDiseases: payload.detectedDiseases || [],
        generatedAt: payload.generatedAt
      };
    } catch (error) {
      console.warn('Knowledge retrieval failed:', error.message);
      this.lastResults = [];
      return { results: [], detectedDiseases: [], error: error.message };
    }
  }

  getStats() {
    return {
      totalDocuments: this.status?.totalDocuments || 0,
      diseaseProfiles: this.status?.diseaseProfiles || 0,
      lastResultCount: this.lastResults.length,
      degraded: Boolean(this.status?.degraded)
    };
  }

  isReady() {
    return this.initialized;
  }
}

export default KnowledgeBase;
