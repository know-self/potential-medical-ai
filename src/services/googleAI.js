import { medicalApi } from './apiClient.js';

export const PROMPT_AGENTS = {
  HOSPITAL_SUPPORT: {
    name: 'Hospital Support Agent',
    description: 'Evidence-aware healthcare information assistant',
    systemPrompt: `You are an evidence-aware healthcare information assistant.
- Do not diagnose, prescribe, or claim certainty.
- Treat emergency and self-harm language as urgent and direct the person to local emergency services.
- Use the supplied evidence context and preserve uncertainty.
- Explain how comorbidities, age, pregnancy, kidney/liver function, and medicines may change interpretation.
- Distinguish established guidelines from emerging research.
- Use the user's language.
- Include concise next steps and advise professional evaluation when appropriate.`
  }
};

function formatHistory(history = []) {
  return history.slice(-10).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n');
}

export class GoogleAIService {
  constructor() {
    this.model = import.meta.env.VITE_GOOGLE_AI_MODEL || 'server-configured';
  }

  getAvailableAgents() {
    return Object.entries(PROMPT_AGENTS).map(([id, agent]) => ({ id, ...agent }));
  }

  getAgent(agentId) {
    return PROMPT_AGENTS[agentId] || null;
  }

  async processWithAgent(agentId, message, conversationHistory = [], evidenceContext = '') {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const prompt = [
      agent.systemPrompt,
      evidenceContext ? `EVIDENCE CONTEXT:\n${evidenceContext}` : '',
      formatHistory(conversationHistory),
      `CURRENT USER QUESTION:\n${message}`
    ].filter(Boolean).join('\n\n');
    const result = await medicalApi.generateGoogle(prompt, { temperature: 0.2, maxTokens: 5000 });
    return result.text;
  }

  async guideHealthcareResponse(openRouterResponse, userMessage, evidenceContext = '') {
    const prompt = `${PROMPT_AGENTS.HOSPITAL_SUPPORT.systemPrompt}\n\nEVIDENCE CONTEXT:\n${evidenceContext}\n\nUSER QUESTION:\n${userMessage}\n\nDRAFT RESPONSE:\n${openRouterResponse}\n\nReturn an improved, concise response. Do not invent sources.`;
    try {
      const result = await medicalApi.generateGoogle(prompt, { temperature: 0.1, maxTokens: 5000 });
      return result.text;
    } catch {
      return openRouterResponse;
    }
  }

  async processWithAgentStream(agentId, message, conversationHistory = [], onChunk, evidenceContext = '') {
    const text = await this.processWithAgent(agentId, message, conversationHistory, evidenceContext);
    for (let index = 0; index < text.length; index += 80) onChunk?.(text.slice(index, index + 80));
    return text;
  }

  getAgentExamples() {
    return [];
  }
}
