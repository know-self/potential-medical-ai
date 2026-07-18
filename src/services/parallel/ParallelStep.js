import { GoogleAIService, PROMPT_AGENTS } from '../googleAI.js';
import { OpenRouterService } from '../openrouter.js';

const SYSTEM_PROMPT = `${PROMPT_AGENTS.HOSPITAL_SUPPORT.systemPrompt}

When evidence is supplied:
- Cite evidence with bracket numbers such as [1] only when the numbered source supports the claim.
- State when evidence is emerging, jurisdiction-specific, old, or awaiting clinical review.
- Never convert a trial registration or safety report alone into a treatment recommendation.`;

export class ParallelStep {
  constructor() {
    this.openRouterService = new OpenRouterService();
    this.googleAIService = new GoogleAIService();
    this.isInitialized = false;
  }

  async initialize() {
    this.isInitialized = true;
  }

  buildMessages(userQuery, conversationHistory = [], ragContext = '') {
    const history = conversationHistory.slice(-12).filter((message) => message?.content);
    const last = history[history.length - 1];
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(ragContext ? [{ role: 'system', content: `CURRENT VERSIONED EVIDENCE:\n${ragContext}` }] : []),
      ...history
    ];
    if (!last || last.role !== 'user' || last.content !== userQuery) {
      messages.push({ role: 'user', content: userQuery });
    }
    return messages;
  }

  async generateGoogleResponse(userQuery, conversationHistory, ragContext = '') {
    if (!this.isInitialized) throw new Error('Parallel Step not initialized');
    try {
      const response = await this.googleAIService.processWithAgent('HOSPITAL_SUPPORT', userQuery, conversationHistory, ragContext);
      return { model: this.googleAIService.model, response, confidence: 'medium', timestamp: Date.now() };
    } catch (error) {
      return { model: this.googleAIService.model, response: '', confidence: 'low', error: error.message, timestamp: Date.now() };
    }
  }

  async generateOpenRouterResponse(userQuery, conversationHistory, ragContext = '', onChunk = null) {
    if (!this.isInitialized) throw new Error('Parallel Step not initialized');
    try {
      const response = await this.openRouterService.sendMessages(this.buildMessages(userQuery, conversationHistory, ragContext), onChunk);
      return { model: this.openRouterService.model, response, confidence: 'medium', timestamp: Date.now() };
    } catch (error) {
      return { model: this.openRouterService.model, response: '', confidence: 'low', error: error.message, timestamp: Date.now() };
    }
  }

  async processWithParallelStreaming(userQuery, conversationHistory, ragContext = '', onChunk = null) {
    if (!this.isInitialized) throw new Error('Parallel Step not initialized');
    const openRouterResponse = await this.generateOpenRouterResponse(userQuery, conversationHistory, ragContext, onChunk);
    const googleResponse = await this.generateGoogleResponse(userQuery, conversationHistory, ragContext);
    const success = Boolean(openRouterResponse.response || googleResponse.response);
    return { success, googleResponse, openRouterResponse, timestamp: Date.now() };
  }

  analyzeResponseQuality(response = '') {
    const text = String(response).trim();
    let score = 0;
    const issues = [];
    if (text.length >= 120) score += 2;
    else issues.push('response-too-short');
    if (/\[[1-9]\d*\]/.test(text)) score += 1;
    if (/consult|healthcare professional|bác sĩ|nhân viên y tế/i.test(text)) score += 1;
    if (/diagnos(?:e|is)|chẩn đoán chắc chắn/i.test(text) && !/cannot|không thể/i.test(text)) issues.push('possible-overclaim');
    if (!issues.includes('possible-overclaim')) score += 1;
    return { score, issues, length: text.length };
  }

  async combineAndAnalyzeResponses(_userQuery, _ragContext, googleResult, openRouterResult) {
    const googleQuality = this.analyzeResponseQuality(googleResult.response);
    const openRouterQuality = this.analyzeResponseQuality(openRouterResult.response);
    let finalResponse = '';
    let primary = 'none';

    if (openRouterResult.response && openRouterQuality.score >= googleQuality.score) {
      finalResponse = openRouterResult.response;
      primary = 'openrouter';
    } else if (googleResult.response) {
      finalResponse = googleResult.response;
      primary = 'google';
    }

    return {
      success: Boolean(finalResponse),
      finalResponse: finalResponse || 'The medical information service is temporarily unavailable. Please try again or contact a healthcare professional if the concern is urgent.',
      googleQuality,
      openRouterQuality,
      qualityMetrics: { primary, googleQuality, openRouterQuality },
      timestamp: Date.now()
    };
  }

  getParallelStats() {
    return {
      isInitialized: this.isInitialized,
      models: [this.googleAIService.model, this.openRouterService.model],
      serverSideCredentials: true,
      streaming: true,
      timestamp: Date.now()
    };
  }

  isReady() {
    return this.isInitialized;
  }
}
