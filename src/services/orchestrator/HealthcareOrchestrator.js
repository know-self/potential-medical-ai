import { AnalyticsStep } from '../analytics/AnalyticsStep.js';
import { ParallelStep } from '../parallel/ParallelStep.js';
import { RAGStep } from '../rag/RAGStep.js';
import { assessMedicalSafety, buildSafetyResponse, detectLocale } from '../safety/medicalSafety.js';

function citationSection(citations = []) {
  if (!citations.length) return '';
  const lines = citations.slice(0, 8).map((citation) => {
    const date = citation.updatedAt || citation.publishedAt || 'date unavailable';
    const label = `${citation.source}; ${date}; tier ${citation.evidenceTier}; ${citation.reviewStatus}`;
    return citation.url
      ? `${citation.number}. [${citation.title}](${citation.url}) — ${label}`
      : `${citation.number}. ${citation.title} — ${label}`;
  });
  return `\n\n### Evidence sources\n${lines.join('\n')}`;
}

export class HealthcareOrchestrator {
  constructor() {
    this.ragStep = new RAGStep();
    this.parallelStep = new ParallelStep();
    this.analyticsStep = new AnalyticsStep();
    this.isInitialized = false;
  }

  async initialize() {
    await Promise.all([
      this.ragStep.initialize(),
      this.parallelStep.initialize(),
      this.analyticsStep.initialize()
    ]);
    this.isInitialized = true;
  }

  async processUserQuery(userQuery, conversationHistory = [], chatId = null, onChunk = null) {
    if (!this.isInitialized) throw new Error('Healthcare Orchestrator not initialized');

    const safetyAssessment = assessMedicalSafety(userQuery);
    if (safetyAssessment.level !== 'normal') {
      const response = buildSafetyResponse(safetyAssessment, detectLocale(userQuery));
      onChunk?.(response);
      return {
        success: true,
        response,
        safety: safetyAssessment,
        ragContext: null,
        parallelResults: null,
        timestamp: Date.now()
      };
    }

    try {
      const ragResult = await this.executeRAGStep(userQuery, conversationHistory);
      const parallelResult = await this.executeParallelStep(userQuery, conversationHistory, ragResult.combinedContext, onChunk);
      const response = this.synthesizeFinalResponse(parallelResult.finalResponse, ragResult.citations);
      this.runAnalyticsInBackground(userQuery, chatId, conversationHistory);
      return {
        success: true,
        response,
        safety: safetyAssessment,
        ragContext: ragResult,
        parallelResults: parallelResult,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        response: 'The evidence and model services are temporarily unavailable. For urgent symptoms, contact local emergency services. Otherwise, try again or consult a qualified healthcare professional.',
        safety: safetyAssessment,
        timestamp: Date.now()
      };
    }
  }

  async executeRAGStep(userQuery, conversationHistory) {
    const result = await this.ragStep.generateRAGContext(userQuery, conversationHistory);
    return {
      success: result.success,
      knowledgeContext: result.knowledgeContext,
      pubmedData: result.pubmedData,
      citations: result.citations || [],
      detectedDiseases: result.detectedDiseases || [],
      combinedContext: result.combinedContext || '',
      error: result.error,
      timestamp: Date.now()
    };
  }

  async executeParallelStep(userQuery, conversationHistory, ragContext, onChunk = null) {
    const processed = await this.parallelStep.processWithParallelStreaming(userQuery, conversationHistory, ragContext, onChunk);
    const combined = await this.parallelStep.combineAndAnalyzeResponses(
      userQuery,
      ragContext,
      processed.googleResponse || {},
      processed.openRouterResponse || {}
    );
    return {
      ...processed,
      finalResponse: combined.finalResponse,
      qualityMetrics: combined.qualityMetrics,
      success: combined.success,
      timestamp: Date.now()
    };
  }

  async runAnalyticsInBackground(userQuery, chatId, conversationHistory) {
    queueMicrotask(async () => {
      try {
        const userMessage = { role: 'user', content: userQuery };
        await this.analyticsStep.analyzeUserMessage(userMessage, chatId);
        await this.analyticsStep.updateSymptomMemory(chatId, [...conversationHistory, userMessage]);
      } catch (error) {
        console.warn('Local analytics failed:', error.message);
      }
    });
  }

  synthesizeFinalResponse(finalResponse, citations = []) {
    return `${finalResponse || 'No response was generated.'}${citationSection(citations)}\n\n**Safety note:** This service provides general information, not a diagnosis or prescription. Treatment decisions require a qualified healthcare professional who can review the full clinical context.`;
  }

  getComprehensiveStats() {
    return {
      rag: this.ragStep.getRAGStats(),
      parallel: this.parallelStep.getParallelStats(),
      analytics: this.analyticsStep.getAnalyticsStats(),
      system: { isInitialized: this.isInitialized, serverSideSecrets: true, timestamp: Date.now() }
    };
  }

  isReady() {
    return this.isInitialized && this.ragStep.isReady() && this.parallelStep.isReady() && this.analyticsStep.isReady();
  }

  getStepStatus() {
    return { rag: this.ragStep.isReady(), parallel: this.parallelStep.isReady(), analytics: this.analyticsStep.isReady() };
  }

  async healthCheck() {
    const status = { orchestrator: this.isInitialized, ...this.getStepStatus(), timestamp: Date.now() };
    return { success: true, status, allSystemsOperational: status.orchestrator && status.rag && status.parallel && status.analytics };
  }
}
