// Healthcare Orchestrator - Coordinates RAG, Parallel, and Analytics Steps
import { RAGStep } from '../rag/RAGStep.js';
import { ParallelStep } from '../parallel/ParallelStep.js';
import { AnalyticsStep } from '../analytics/AnalyticsStep.js';

export class HealthcareOrchestrator {
  constructor(openRouterApiKey, googleApiKey) {
    // Initialize all steps
    this.ragStep = new RAGStep(googleApiKey);
    this.parallelStep = new ParallelStep(openRouterApiKey, googleApiKey);
    this.analyticsStep = new AnalyticsStep(googleApiKey);
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize all steps in parallel
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

  // Main processing pipeline - Show results first, then analytics
  async processUserQuery(userQuery, conversationHistory = [], chatId = null, onChunk = null) {
    if (!this.isInitialized) {
      throw new Error('Healthcare Orchestrator not initialized');
    }

    try {
      console.log('Starting healthcare query processing pipeline...');

      // Step 1: RAG - Retrieve knowledge and context
      const ragResult = await this.executeRAGStep(userQuery, conversationHistory);
      console.log('RAG Step completed');

      // Step 2: Parallel - Generate AI responses with streaming
      const parallelResult = await this.executeParallelStep(userQuery, conversationHistory, ragResult.combinedContext, onChunk);
      console.log('Parallel Step completed');

      // Step 3: Synthesize final response for immediate display
      const finalResponse = await this.synthesizeFinalResponse(userQuery, ragResult, parallelResult);

      // Step 4: Run analytics in background (after showing results)
      this.runAnalyticsInBackground(userQuery, chatId, conversationHistory);

      return {
        success: true,
        response: finalResponse,
        ragContext: ragResult,
        parallelResults: parallelResult,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Error in healthcare query processing:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Execute RAG Step
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

  // Execute Parallel Step with streaming
  async executeParallelStep(userQuery, conversationHistory, ragContext, onChunk = null) {
    try {
      const parallelResult = await this.parallelStep.processWithParallelStreaming(userQuery, conversationHistory, ragContext, onChunk);
      
      if (parallelResult.success) {
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
      } else {
        throw new Error('Parallel processing failed');
      }
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

  // Run analytics in background (after showing results)
  async runAnalyticsInBackground(userQuery, chatId, conversationHistory) {
    try {
      console.log('Starting background analytics processing...');
      
      // Create user message object for analysis
      const userMessage = {
        role: 'user',
        content: userQuery
      };

      // Analyze current message
      const messageAnalysis = await this.analyticsStep.analyzeUserMessage(userMessage, chatId);
      
      // Update symptom memory (background processing)
      const memoryUpdate = await this.analyticsStep.updateSymptomMemory(chatId, conversationHistory);
      
      // Generate conversation insights
      const insights = await this.analyticsStep.generateConversationInsights(chatId, conversationHistory);

      // console.log('Background analytics completed:', {
      //   messageAnalysis: messageAnalysis.success,
      //   memoryUpdate: memoryUpdate.success,
      //   insights: insights.success
      // });

      return {
        success: true,
        messageAnalysis: messageAnalysis,
        memoryUpdate: memoryUpdate,
        insights: insights,
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

  // Synthesize final response
  async synthesizeFinalResponse(userQuery, ragResult, parallelResult) {
    try {
      let finalResponse = parallelResult.finalResponse;

      // Add disclaimers and recommendations
      finalResponse += `\n\n**Important Note:** This information is for reference only. Please consult healthcare professionals for accurate advice.`;

      return finalResponse;
    } catch (error) {
      console.error('Error synthesizing final response:', error);
      return 'I apologize, but I encountered an error processing your request. Please try again.';
    }
  }

  // Get comprehensive system statistics
  getComprehensiveStats() {
    return {
      rag: this.ragStep.getRAGStats(),
      parallel: this.parallelStep.getParallelStats(),
      analytics: this.analyticsStep.getAnalyticsStats(),
      system: {
        isInitialized: this.isInitialized,
        timestamp: Date.now()
      }
    };
  }

  // Check if orchestrator is ready
  isReady() {
    return this.isInitialized && 
           this.ragStep.isReady() && 
           this.parallelStep.isReady() && 
           this.analyticsStep.isReady();
  }

  // Get step status
  getStepStatus() {
    return {
      rag: this.ragStep.isReady(),
      parallel: this.parallelStep.isReady(),
      analytics: this.analyticsStep.isReady()
    };
  }

  // Health check
  async healthCheck() {
    try {
      const status = {
        orchestrator: this.isInitialized,
        rag: this.ragStep.isReady(),
        parallel: this.parallelStep.isReady(),
        analytics: this.analyticsStep.isReady(),
        timestamp: Date.now()
      };

      return {
        success: true,
        status: status,
        allSystemsOperational: Object.values(status).every(s => s === true || (typeof s === 'object' && s !== null))
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