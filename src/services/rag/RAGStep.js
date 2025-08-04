// RAG Step - Knowledge Retrieval and Context Generation
import KnowledgeBase from './KnowledgeBase.js';
import VectorStore from './VectorStore.js';

export class RAGStep {
  constructor(googleApiKey) {
    this.knowledgeBase = new KnowledgeBase(googleApiKey);
    this.vectorStore = new VectorStore(googleApiKey);
    this.isInitialized = false;
  }

  async initialize() {
    try {
      await Promise.all([
        this.knowledgeBase.initialize(),
        this.vectorStore.initialize()
      ]);
      this.isInitialized = true;
      console.log('RAG Step initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RAG Step:', error);
      throw error;
    }
  }

  // Step 1: Retrieve knowledge base context
  async retrieveKnowledgeContext(query, topK = 3) {
    if (!this.isInitialized) {
      throw new Error('RAG Step not initialized');
    }

    try {
      const knowledgeContext = await this.knowledgeBase.searchRelevantInfo(query, topK);
      return {
        source: 'knowledge_base',
        context: knowledgeContext,
        relevance: 'high',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error retrieving knowledge context:', error);
      return {
        source: 'knowledge_base',
        context: '',
        relevance: 'low',
        error: error.message
      };
    }
  }

  // Step 2: Generate comprehensive RAG context
  async generateRAGContext(query, conversationHistory = []) {
    if (!this.isInitialized) {
      throw new Error('RAG Step not initialized');
    }

    try {
      // Retrieve knowledge data
      const knowledgeResult = await this.retrieveKnowledgeContext(query);

      // Combine and format context
      const combinedContext = this.combineContexts(knowledgeResult, conversationHistory);
      
      return {
        success: true,
        knowledgeContext: knowledgeResult,
        pubmedData: { source: 'pubmed', data: [], relevance: 'low' }, // Empty PubMed data
        combinedContext: combinedContext,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating RAG context:', error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Combine different context sources
  combineContexts(knowledgeResult, conversationHistory) {
    let combinedContext = '';

    // Add knowledge base context
    if (knowledgeResult.context && knowledgeResult.relevance === 'high') {
      combinedContext += `**Healthcare Knowledge Base:**\n${knowledgeResult.context}\n\n`;
    }

    // Add conversation context if available
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-3);
      const conversationContext = recentMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
      combinedContext += `**Recent Conversation Context:**\n${conversationContext}\n\n`;
    }

    return combinedContext.trim();
  }

  // Get RAG statistics
  getRAGStats() {
    return {
      knowledgeBase: this.knowledgeBase.getStats(),
      vectorStore: {
        documentCount: this.vectorStore.getDocumentCount(),
        isReady: this.vectorStore.isReady()
      },
      isInitialized: this.isInitialized
    };
  }

  // Check if RAG step is ready
  isReady() {
    return this.isInitialized && this.knowledgeBase.isReady();
  }
} 