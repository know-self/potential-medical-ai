// Parallel Step - Dual AI Model Processing
import { OpenRouterService } from '../openrouter.js';
import { GoogleAIService } from '../googleAI.js';

export class ParallelStep {
  constructor(openRouterApiKey, googleApiKey) {
    this.openRouterService = new OpenRouterService(openRouterApiKey);
    this.googleAIService = new GoogleAIService(googleApiKey);
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize both AI services
      this.isInitialized = true;
      console.log('Parallel Step initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Parallel Step:', error);
      throw error;
    }
  }

  // Step 1: Generate Google AI response
  async generateGoogleResponse(userQuery, conversationHistory, ragContext = '') {
    if (!this.isInitialized) {
      throw new Error('Parallel Step not initialized');
    }

    try {
      const prompt = await this.createGooglePrompt(userQuery, conversationHistory, ragContext);
      const response = await this.googleAIService.processWithAgent('HOSPITAL_SUPPORT', userQuery, conversationHistory);
      
      return {
        model: 'google-gemini-2.5-flash-lite',
        response: response,
        confidence: 'high',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating Google AI response:', error);
      return {
        model: 'google-gemini-2.5-flash-lite',
        response: 'Tôi xin lỗi, nhưng tôi gặp lỗi khi xử lý yêu cầu của bạn.',
        confidence: 'low',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Step 2: Generate OpenRouter response with streaming
  async generateOpenRouterResponse(userQuery, conversationHistory, ragContext = '', onChunk = null) {
    if (!this.isInitialized) {
      throw new Error('Parallel Step not initialized');
    }

    try {
      const prompt = await this.createOpenRouterPrompt(userQuery, conversationHistory, ragContext);
      const response = await this.openRouterService.sendMessage(userQuery, conversationHistory, onChunk);
      
      return {
        model: 'google/gemma-3-12b-it:free',
        response: response,
        confidence: 'high',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating OpenRouter response:', error);
      return {
        model: 'google/gemma-3-12b-it:free',
        response: 'Tôi xin lỗi, nhưng tôi gặp lỗi khi xử lý yêu cầu của bạn.',
        confidence: 'low',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Step 3: Process with parallel streaming
  async processWithParallelStreaming(userQuery, conversationHistory, ragContext = '', onChunk = null) {
    if (!this.isInitialized) {
      throw new Error('Parallel Step not initialized');
    }

    try {
      // Use OpenRouter with streaming for real-time response
      const openRouterResult = await this.generateOpenRouterResponse(userQuery, conversationHistory, ragContext, onChunk);
      
      // Google AI response in background (non-streaming)
      const googleResult = await this.generateGoogleResponse(userQuery, conversationHistory, ragContext);

      return {
        success: true,
        googleResponse: googleResult,
        openRouterResponse: openRouterResult,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error in parallel processing:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Create Google AI prompt with RAG context
  async createGooglePrompt(userQuery, conversationHistory, ragContext) {
    const { PromptManager } = await import('../flow/PromptManager.js');
    const promptManager = new PromptManager();
    
    // Tạo prompt phù hợp dựa trên nội dung câu hỏi
    let basePrompt = promptManager.createAppropriatePrompt(userQuery);
    
    // Thêm context từ RAG
    if (ragContext) {
      basePrompt += `\n\n**Thông tin bổ sung từ cơ sở kiến thức:**\n${ragContext}\n\n`;
    }

    // Thêm lịch sử hội thoại
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-3); // Chỉ lấy 3 tin nhắn gần nhất
      const historyText = recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      basePrompt += `\n\n**Lịch sử hội thoại gần đây:**\n${historyText}\n\n`;
    }

    basePrompt += `\n**Câu hỏi hiện tại:** "${userQuery}"\n\nHãy trả lời dựa trên thông tin trên và tuân thủ hướng dẫn đã được định nghĩa.`;

    return basePrompt;
  }

  // Create OpenRouter prompt with RAG context
  async createOpenRouterPrompt(userQuery, conversationHistory, ragContext) {
    const { PromptManager } = await import('../flow/PromptManager.js');
    const promptManager = new PromptManager();
    
    // Tạo prompt phù hợp dựa trên nội dung câu hỏi
    let basePrompt = promptManager.createAppropriatePrompt(userQuery);
    
    // Thêm context từ RAG
    if (ragContext) {
      basePrompt += `\n\n**Thông tin bổ sung từ cơ sở kiến thức:**\n${ragContext}\n\n`;
    }

    // Thêm lịch sử hội thoại
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-3); // Chỉ lấy 3 tin nhắn gần nhất
      const historyText = recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      basePrompt += `\n\n**Lịch sử hội thoại gần đây:**\n${historyText}\n\n`;
    }

    basePrompt += `\n**Câu hỏi hiện tại:** "${userQuery}"\n\nHãy trả lời dựa trên thông tin trên và tuân thủ hướng dẫn đã được định nghĩa.`;

    return basePrompt;
  }

  // Combine and analyze responses
  async combineAndAnalyzeResponses(userQuery, ragContext, googleResult, openRouterResult) {
    if (!this.isInitialized) {
      throw new Error('Parallel Step not initialized');
    }

    try {
      // Analyze quality of both responses
      const googleQuality = this.analyzeResponseQuality(googleResult.response);
      const openRouterQuality = this.analyzeResponseQuality(openRouterResult.response);

      // Choose the better response or combine them
      let finalResponse;
      let qualityMetrics;

      if (googleQuality.score > openRouterQuality.score) {
        finalResponse = googleResult.response;
        qualityMetrics = {
          primary: 'google',
          googleQuality: googleQuality,
          openRouterQuality: openRouterQuality
        };
      } else {
        finalResponse = openRouterResult.response;
        qualityMetrics = {
          primary: 'openrouter',
          googleQuality: googleQuality,
          openRouterQuality: openRouterQuality
        };
      }

      return {
        success: true,
        finalResponse: finalResponse,
        googleQuality: googleQuality,
        openRouterQuality: openRouterQuality,
        qualityMetrics: qualityMetrics,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error combining responses:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Analyze response quality
  analyzeResponseQuality(response) {
    let score = 0;
    const issues = [];

    // Check for length
    if (response.length < 50) {
      score -= 2;
      issues.push('Response too short');
    } else if (response.length > 2000) {
      score += 1;
    }

    // Check for medical keywords
    const medicalKeywords = ['treatment', 'symptoms', 'diagnosis', 'medication', 'therapy', 'health', 'medical', 'doctor', 'patient', 'clinical'];
    const foundKeywords = medicalKeywords.filter(keyword => 
      response.toLowerCase().includes(keyword)
    );
    score += foundKeywords.length * 0.5;

    // Check for Vietnamese content
    if (response.includes('Tôi') || response.includes('Bạn') || response.includes('của')) {
      score += 1;
    }

    // Check for disclaimers
    if (response.includes('consult') || response.includes('professional') || response.includes('doctor')) {
      score += 1;
    }

    return {
      score: Math.max(0, score),
      issues: issues,
      length: response.length,
      medicalKeywords: foundKeywords.length
    };
  }

  // Combine two responses
  combineResponses(response1, response2) {
    // Simple combination - take the longer, more detailed response
    if (response1.length > response2.length) {
      return response1;
    } else {
      return response2;
    }
  }

  // Get parallel processing statistics
  getParallelStats() {
    return {
      isInitialized: this.isInitialized,
      models: ['google-gemini-2.5-flash-lite', 'google/gemma-3-12b-it:free'],
      streaming: true,
      timestamp: Date.now()
    };
  }

  // Check if parallel step is ready
  isReady() {
    return this.isInitialized;
  }
} 