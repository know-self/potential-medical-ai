// Analytics Step - Symptom Analysis and Data Insights
export class AnalyticsStep {
  constructor(googleApiKey) {
    this.googleApiKey = googleApiKey;
    this.genAI = null;
    this.model = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize Google AI for symptom analysis
      if (this.googleApiKey) {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        this.genAI = new GoogleGenerativeAI(this.googleApiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
        console.log('Google AI initialized for analytics');
      }
      
      this.isInitialized = true;
      console.log('Analytics Step initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Analytics Step:', error);
      throw error;
    }
  }

  // Step 1: Analyze user message for symptoms
  async analyzeUserMessage(message, chatId) {
    if (!this.isInitialized) {
      throw new Error('Analytics Step not initialized');
    }

    try {
      const symptoms = await this.analyzeSymptomsWithAI(message);
      
      return {
        success: true,
        chatId: chatId,
        symptoms: symptoms,
        messageContent: message.content,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error analyzing user message:', error);
      return {
        success: false,
        chatId: chatId,
        symptoms: [],
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Analyze symptoms with AI
  async analyzeSymptomsWithAI(message) {
    if (message.role !== 'user') return [];
    
    if (!this.model) {
      console.log('AI model not yet initialized, waiting...');
      return [];
    }
    
    try {
      const { PromptManager } = await import('../flow/PromptManager.js');
      const promptManager = new PromptManager();
      
      const prompt = `Bạn là trợ lý AI chuyên phân tích triệu chứng sức khỏe. Hãy phân tích tin nhắn của người dùng và trích xuất các triệu chứng, tình trạng sức khỏe hoặc mối quan tâm y tế được đề cập.

**Tập trung vào:**
- Triệu chứng thể chất (đau, sốt, mệt mỏi, v.v.)
- Triệu chứng sức khỏe tâm thần (lo âu, trầm cảm, stress, v.v.)
- Tình trạng mãn tính (tiểu đường, huyết áp cao, v.v.)
- Vấn đề sức khỏe cấp tính
- Mối quan tâm liên quan đến thuốc
- Yếu tố lối sống ảnh hưởng đến sức khỏe

**Tin nhắn người dùng:** "${message.content}"

**Hướng dẫn trả lời:**
- Chỉ trả về một mảng JSON các triệu chứng/tình trạng được trích xuất
- Định dạng: ["triệu chứng1", "triệu chứng2", "tình trạng1"]
- Nếu không có triệu chứng hoặc tình trạng nào được đề cập, trả về mảng rỗng []
- Tự động nhận diện ngôn ngữ của người dùng và trả về triệu chứng theo ngôn ngữ đó

**Lưu ý:** Chỉ trả về JSON array, không có văn bản khác.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Try to parse JSON response
      try {
        const symptoms = JSON.parse(text);
        return Array.isArray(symptoms) ? symptoms : [];
      } catch (parseError) {
        // If JSON parsing fails, extract symptoms from text response
        return this.extractSymptomsFromText(text);
      }
    } catch (error) {
      console.error('Error analyzing symptoms with AI:', error);
      return [];
    }
  }

  // Fallback method to extract symptoms from AI text response
  extractSymptomsFromText(text) {
    const symptoms = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const cleanLine = line.trim().replace(/^[-•*]\s*/, '').replace(/^["']|["']$/g, '');
      if (cleanLine && cleanLine.length > 2 && !cleanLine.includes('[') && !cleanLine.includes(']')) {
        symptoms.push(cleanLine);
      }
    }
    
    return symptoms;
  }

  // Step 2: Update symptom memory for a chat
  async updateSymptomMemory(chatId, messages) {
    if (!this.isInitialized) {
      throw new Error('Analytics Step not initialized');
    }

    try {
      // Process in background
      setTimeout(async () => {
        try {
          const userMessages = messages.filter(msg => msg.role === 'user');
          const allSymptoms = [];
          
          // Analyze each user message with AI
          for (const message of userMessages) {
            const symptoms = await this.analyzeSymptomsWithAI(message);
            allSymptoms.push(...symptoms);
          }
          
          // Remove duplicates and store
          const uniqueSymptoms = [...new Set(allSymptoms)];
          console.log(`Analytics: Updated symptom memory for chat ${chatId}:`, uniqueSymptoms);
        } catch (error) {
          console.error('Error updating symptom memory with AI:', error);
        }
      }, 0);

      return {
        success: true,
        chatId: chatId,
        messageCount: messages.length,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error in symptom memory update:', error);
      return {
        success: false,
        chatId: chatId,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Step 3: Generate conversation insights
  async generateConversationInsights(chatId, messages) {
    if (!this.isInitialized) {
      throw new Error('Analytics Step not initialized');
    }

    try {
      const userMessages = messages.filter(msg => msg.role === 'user');
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      
      // Analyze all user messages for symptoms
      const allSymptoms = [];
      for (const message of userMessages) {
        const symptoms = await this.analyzeSymptomsWithAI(message);
        allSymptoms.push(...symptoms);
      }
      const uniqueSymptoms = [...new Set(allSymptoms)];

      const insights = {
        chatId: chatId,
        totalMessages: messages.length,
        userMessages: userMessages.length,
        assistantMessages: assistantMessages.length,
        symptoms: uniqueSymptoms,
        symptomCount: uniqueSymptoms.length,
        conversationDuration: this.calculateConversationDuration(messages),
        averageMessageLength: this.calculateAverageMessageLength(messages),
        healthTopics: this.extractHealthTopics(messages),
        timestamp: Date.now()
      };

      return {
        success: true,
        insights: insights
      };
    } catch (error) {
      console.error('Error generating conversation insights:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Step 4: Generate comprehensive analytics report
  async generateAnalyticsReport() {
    if (!this.isInitialized) {
      throw new Error('Analytics Step not initialized');
    }

    try {
      const report = {
        summary: {
          totalChats: 0, // Simplified for now
          totalSymptoms: 0,
          uniqueSymptoms: 0,
          averageSymptomsPerChat: 0
        },
        symptomAnalysis: {
          mostCommonSymptoms: [],
          symptomCategories: { physical: [], mental: [], chronic: [], acute: [] },
          symptomTrends: []
        },
        systemStatus: {
          aiModel: this.model ? 'Active' : 'Not initialized',
          isInitialized: this.isInitialized
        },
        timestamp: Date.now()
      };

      return {
        success: true,
        report: report
      };
    } catch (error) {
      console.error('Error generating analytics report:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Helper methods for analytics
  calculateConversationDuration(messages) {
    if (messages.length < 2) return 0;
    
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    
    const startTime = new Date(firstMessage.createdAt || firstMessage.timestamp);
    const endTime = new Date(lastMessage.createdAt || lastMessage.timestamp);
    
    return Math.round((endTime - startTime) / 1000 / 60); // Duration in minutes
  }

  calculateAverageMessageLength(messages) {
    if (messages.length === 0) return 0;
    
    const totalLength = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
    return Math.round(totalLength / messages.length);
  }

  extractHealthTopics(messages) {
    const healthKeywords = [
      'diabetes', 'hypertension', 'pain', 'fever', 'fatigue', 'anxiety',
      'depression', 'medication', 'treatment', 'symptoms', 'diagnosis',
      'blood pressure', 'heart', 'lung', 'kidney', 'liver', 'brain'
    ];

    const topics = new Set();
    messages.forEach(msg => {
      const content = msg.content.toLowerCase();
      healthKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          topics.add(keyword);
        }
      });
    });

    return Array.from(topics);
  }



  // Get analytics statistics
  getAnalyticsStats() {
    return {
      symptomAnalysis: {
        totalChats: 0, // Simplified for now
        totalSymptoms: 0,
        uniqueSymptoms: 0,
        averageSymptomsPerChat: 0
      },
      aiModel: {
        status: this.model ? 'Active' : 'Not initialized',
        isReady: this.isInitialized
      },
      isInitialized: this.isInitialized
    };
  }

  // Check if analytics step is ready
  isReady() {
    return this.isInitialized;
  }
} 