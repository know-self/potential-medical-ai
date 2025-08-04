import { GoogleGenerativeAI } from '@google/generative-ai';

class VectorStore {
  constructor(apiKey) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.embeddingModel = this.genAI.getGenerativeModel({ model: 'embedding-001' });
    this.documents = [];
    this.embeddings = [];
  }

  // Generate embeddings for text
  async generateEmbedding(text) {
    try {
      const result = await this.embeddingModel.embedContent(text);
      const embedding = await result.embedding;
      return embedding.values;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  // Add document to vector store
  async addDocument(id, content, metadata = {}) {
    try {
      const embedding = await this.generateEmbedding(content);
      if (embedding) {
        this.documents.push({
          id,
          content,
          metadata,
          embedding
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error adding document:', error);
      return false;
    }
  }

  // Calculate cosine similarity between two vectors
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Search for similar documents
  async search(query, topK = 5, threshold = 0.7) {
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) return [];

      const similarities = this.documents.map(doc => ({
        document: doc,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
      }));

      // Sort by similarity and filter by threshold
      const results = similarities
        .filter(item => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

      return results.map(item => ({
        ...item.document,
        similarity: item.similarity
      }));
    } catch (error) {
      console.error('Error searching documents:', error);
      return [];
    }
  }

  // Get all documents
  getAllDocuments() {
    return this.documents.map(doc => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata
    }));
  }

  // Remove document by ID
  removeDocument(id) {
    const index = this.documents.findIndex(doc => doc.id === id);
    if (index !== -1) {
      this.documents.splice(index, 1);
      return true;
    }
    return false;
  }

  // Clear all documents
  clear() {
    this.documents = [];
  }

  // Get document count
  getDocumentCount() {
    return this.documents.length;
  }

  // Initialize vector store
  async initialize() {
    try {
      // Test embedding generation to ensure API is working
      const testEmbedding = await this.generateEmbedding('test');
      if (testEmbedding) {
        console.log('Vector store initialized successfully');
        return true;
      } else {
        throw new Error('Failed to generate test embedding');
      }
    } catch (error) {
      console.error('Error initializing vector store:', error);
      return false;
    }
  }

  // Check if vector store is ready
  isReady() {
    return this.genAI && this.embeddingModel;
  }
}

export default VectorStore; 