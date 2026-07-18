const TOPICS = [
  ['diabetes', ['diabetes', 'blood sugar', 'glucose', 'tiểu đường', 'đái tháo đường']],
  ['hypertension', ['hypertension', 'high blood pressure', 'tăng huyết áp', 'cao huyết áp']],
  ['kidney', ['kidney', 'renal', 'thận', 'suy thận']],
  ['heart', ['heart', 'cardiac', 'tim', 'suy tim', 'đau ngực']],
  ['respiratory', ['asthma', 'copd', 'wheeze', 'breathless', 'hen', 'khó thở', 'phổi']],
  ['neurology', ['stroke', 'seizure', 'migraine', 'đột quỵ', 'co giật', 'đau đầu']],
  ['mental-health', ['depression', 'anxiety', 'stress', 'trầm cảm', 'lo âu']],
  ['medication', ['medicine', 'medication', 'dose', 'drug', 'thuốc', 'liều']],
  ['infection', ['fever', 'infection', 'cough', 'sốt', 'nhiễm trùng', 'ho']],
  ['cancer', ['cancer', 'tumor', 'ung thư', 'khối u']]
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractTopics(text = '') {
  const normalized = normalize(text);
  return TOPICS.filter(([, aliases]) => aliases.some((alias) => normalized.includes(normalize(alias)))).map(([topic]) => topic);
}

export class AnalyticsStep {
  constructor() {
    this.isInitialized = false;
    this.messageCount = 0;
    this.topicCounts = new Map();
  }

  async initialize() {
    this.isInitialized = true;
  }

  async analyzeUserMessage(message, chatId) {
    if (!this.isInitialized) throw new Error('Analytics Step not initialized');
    const symptoms = extractTopics(message?.content || '');
    this.messageCount += 1;
    for (const topic of symptoms) this.topicCounts.set(topic, (this.topicCounts.get(topic) || 0) + 1);
    return { success: true, chatId, symptoms, messageContent: message?.content || '', timestamp: Date.now(), processing: 'local-no-model' };
  }

  async analyzeSymptomsWithAI(message) {
    return extractTopics(message?.content || '');
  }

  async updateSymptomMemory(chatId, messages = []) {
    const symptoms = [...new Set(messages.filter((message) => message.role === 'user').flatMap((message) => extractTopics(message.content)))];
    return { success: true, chatId, messageCount: messages.length, symptoms, timestamp: Date.now(), persisted: false };
  }

  async generateConversationInsights(chatId, messages = []) {
    const userMessages = messages.filter((message) => message.role === 'user');
    const symptoms = [...new Set(userMessages.flatMap((message) => extractTopics(message.content)))];
    return {
      success: true,
      insights: {
        chatId,
        totalMessages: messages.length,
        userMessages: userMessages.length,
        assistantMessages: messages.filter((message) => message.role === 'assistant').length,
        symptoms,
        symptomCount: symptoms.length,
        averageMessageLength: messages.length ? Math.round(messages.reduce((sum, message) => sum + String(message.content || '').length, 0) / messages.length) : 0,
        timestamp: Date.now()
      }
    };
  }

  getAnalyticsStats() {
    return {
      totalAnalyzedMessages: this.messageCount,
      topicCounts: Object.fromEntries(this.topicCounts),
      processing: 'local-no-model',
      isInitialized: this.isInitialized
    };
  }

  isReady() {
    return this.isInitialized;
  }
}
