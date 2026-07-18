// Healthcare Orchestrator - Coordinates safety, RAG, parallel, and analytics steps
import { RAGStep } from '../rag/RAGStep.js';
import { ParallelStep } from '../parallel/ParallelStep.js';
import { AnalyticsStep } from '../analytics/AnalyticsStep.js';
import {
  assessMedicalSafety,
  buildSafetyResponse,
  detectLocale
} from '../safety/medicalSafety.js';

export class HealthcareOrchestrator {
  constructor(openRouterApiKey, googleApiKey) {
    this.ragStep = new RAGStep(googleApiKey);
    this.parallelStep = new ParallelStep(openRouterApiKey, googleApiKey);
    this.analyticsStep = new AnalyticsStep(googleApiKey);
    this.isInitialized = false;
  }

  async initialize() {
    try {
      await Promise.all([
        this.ragStep.initialize(),
        this.parallelStep.initialize(),
        this.analyticsStep.initialize()
      ]);

      this.isInitialized = true;
      console.log('Healthcare Orchestrator initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Healthcare Orchestrator:', error);
      throw error;
    }
  }

  async processUserQuery(userQuery, conversationHistory = [], chatId = null, onChunk = null) {
    if (!this.isInitialized) {
      throw new Error('Healthcare Orchestrator not initialized');
    }

    const safetyAssessment = assessMedicalSafety(userQuery);

    if (safetyAssessment.level !== 'normal') {
      const response = buildSafetyResponse(safetyAssessment, detectLocale(userQuery));

      // Do not send urgent or crisis content to external model providers before
      // the deterministic safety response is shown to the user.
      this.runAnalyticsInBackground(userQuery, chatId, conversationHistory);

      return {
        success: true,
        response,
        safety: {
          triggered: true,
          level: safetyAssessment.level,
          matchedSignals: safetyAssessment.matchedSignals
        },
        timestamp: Date.now()
      };
    }

    try {
      console.log('Starting healthcare query processing pipeline...');

      const ragResult = await this.executeRAGStep(userQuery, conversationHistory);
      const parallelResult = await this.executeParallelStep(
        userQuery,
        conversationHistory,
        ragResult.combinedContext,
        onChunk
      );
      const finalResponse = await this.synthesizeFinalResponse(parallelResult);

      this.runAnalyticsInBackground(userQuery, chatId, conversationHistory);

      return {
        success: true,
        response: finalResponse,
        safety: { triggered: false, level: 'normal', matchedSignals: [] },
        ragContext: ragResult,
        parallelResults: parallelResult,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error in healthcare query processing:', error);
      return {
        success: false,
        error: error.message,
        response: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: Date.now()
      };
    }
  }

  async executeRAGStep(userQuery, conversationHistory) {
    try {
      const ragContext = await this.ragStep.generateRAGContext(userQuery, conversationHistory);

      return {
        success: true,
        knowledgeContext: ragContext.knowledgeContext,
        pubmedData: ragContext.pubmedData,
        combinedContext: ragContext.combinedContext,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error in RAG Step:', error);
      return {
        success: false,
        error: error.message,
        combinedContext: '',
        timestamp: Date.now()
      };
    }
  }

  async executeParallelStep(userQuery, conversationHistory, ragContext, onChunk = null) {
    try {
      const parallelResult = await this.parallelStep.processWithParallelStreaming(
        userQuery,
        conversationHistory,
        ragContext,
        onChunk
      );

      if (!parallelResult.success) {
        throw new Error('Parallel processing failed');
      }

      const combinedResponse = await this.parallelStep.combineAndAnalyzeResponses(
        userQuery,
        ragContext,
        parallelResult.googleResponse,
        parallelResult.openRouterResponse
      );

      return {
        success: true,
        googleResponse: parallelResult.googleResponse,
        openRouterResponse: parallelResult.openRouterResponse,
        finalResponse: combinedResponse.finalResponse,
        qualityMetrics: {
          googleQuality: combinedResponse.googleQuality,
          openRouterQuality: combinedResponse.openRouterQuality
        },
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error in Parallel Step:', error);
      return {
        success: false,
        error: error.message,
        finalResponse: 'I apologize, but I encountered an error processing your request.',
        timestamp: Date.now()
      };
    }
  }

  async runAnalyticsInBackground(userQuery, chatId, conversationHistory) {
    try {
      const userMessage = { role: 'user', content: userQuery };
      const messageAnalysis = await this.analyticsStep.analyzeUserMessage(userMessage, chatId);
      const memoryUpdate = await this.analyticsStep.updateSymptomMemory(chatId, conversationHistory);
      const insights = await this.analyticsStep.generateConversationInsights(chatId, conversationHistory);

      return {
        success: true,
        messageAnalysis,
        memoryUpdate,
        insights,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error in background analytics:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async synthesizeFinalResponse(parallelResult) {
    try {
      const response = parallelResult.finalResponse || 'I could not generate a complete response.';
      return `${response}\n\n**Important Note:** This information is educational and cannot replace diagnosis or treatment by a qualified healthcare professional.`;
    } catch (error) {
      console.error('Error synthesizing final response:', error);
      return 'I apologize, but I encountered an error processing your request. Please try again.';
    }
  }

  getComprehensiveStats() {
    return {
      rag: this.ragStep.getRAGStats(),
      parallel: this.parallelStep.getParallelStats(),
      analytics: this.analyticsStep.getAnalyticsStats(),
      system: {
        isInitialized: this.isInitialized,
        safetyTriageEnabled: true,
        timestamp: Date.now()
      }
    };
  }

  isReady() {
    return this.isInitialized &&
      this.ragStep.isReady() &&
      this.parallelStep.isReady() &&
      this.analyticsStep.isReady();
  }

  getStepStatus() {
    return {
      safety: true,
      rag: this.ragStep.isReady(),
      parallel: this.parallelStep.isReady(),
      analytics: this.analyticsStep.isReady()
    };
  }

  async healthCheck() {
    try {
      const status = {
        orchestrator: this.isInitialized,
        safety: true,
        rag: this.ragStep.isReady(),
        parallel: this.parallelStep.isReady(),
        analytics: this.analyticsStep.isReady()
      };

      return {
        success: true,
        status,
        allSystemsOperational: Object.values(status).every(Boolean),
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}
