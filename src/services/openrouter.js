import { streamApi } from './apiClient.js';

export class OpenRouterService {
  constructor() {
    this.model = import.meta.env.VITE_OPENROUTER_MODEL || 'server-configured';
  }

  async sendMessages(messages, onChunk) {
    return streamApi('/api/models/openrouter/stream', {
      messages,
      temperature: 0.2,
      maxTokens: 5000
    }, onChunk);
  }

  async sendMessage(message, conversationHistory = [], onChunk) {
    const messages = [...conversationHistory];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || last.content !== message) {
      messages.push({ role: 'user', content: message });
    }
    return this.sendMessages(messages, onChunk);
  }

  async sendMessageStream(_message, conversationHistory = [], onChunk) {
    return this.sendMessages(conversationHistory, onChunk);
  }
}
