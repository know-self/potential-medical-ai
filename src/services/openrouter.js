const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemma-3-12b-it:free';

export class OpenRouterService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    
    // Validate API key format
    if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
      throw new Error('Invalid OpenRouter API key. Please check your .env file.');
    }
  }

  async sendMessage(message, conversationHistory = [], onChunk) {
    try {
      const messages = [
        ...conversationHistory,
        { role: 'user', content: message }
      ];

      // console.log('Sending streaming request to OpenRouter:', {
      //   model: MODEL,
      //   messageCount: messages.length,
      //   hasApiKey: !!this.apiKey
      // });

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'AI Chatbot'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          temperature: 0.3,
          max_tokens: 32682,
          stream: true
        })
      });

      console.log('OpenRouter streaming response status:', response.status);

      if (!response.ok) {
        // Get the raw response text first
        const errorText = await response.text();
        console.error('OpenRouter streaming error response:', errorText);
        
        // Try to parse as JSON if possible
        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
        } catch (parseError) {
          // Use raw text if JSON parsing fails
          errorMessage = `HTTP ${response.status}: ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('Streaming completed');
              return fullResponse;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                if (onChunk) {
                  onChunk(content);
                }
              }
            } catch (e) {
              // Ignore parsing errors for incomplete chunks
              console.debug('Parsing error for chunk:', e.message);
            }
          }
        }
      }

      return fullResponse;
    } catch (error) {
      console.error('Error in streaming:', error);
      throw error;
    }
  }

  async sendMessageStream(message, conversationHistory = [], onChunk) {
    try {
      // Use the conversation history as is, since it already includes the user message
      const messages = conversationHistory;

      // console.log('Sending streaming request to OpenRouter:', {
      //   model: MODEL,
      //   messageCount: messages.length,
      //   hasApiKey: !!this.apiKey
      // });

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'AI Chatbot'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          temperature: 0.3,
          max_tokens: 32682,
          stream: true
        })
      });

      console.log('OpenRouter streaming response status:', response.status);

      if (!response.ok) {
        // Get the raw response text first
        const errorText = await response.text();
        console.error('OpenRouter streaming error response:', errorText);
        
        // Try to parse as JSON if possible
        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
        } catch (parseError) {
          // Use raw text if JSON parsing fails
          errorMessage = `HTTP ${response.status}: ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('Streaming completed');
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Ignore parsing errors for incomplete chunks
              console.debug('Parsing error for chunk:', e.message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in streaming:', error);
      throw error;
    }
  }
} 