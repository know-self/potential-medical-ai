import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Google AI
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_AI_API_KEY);

// Specialized prompt agents
export const PROMPT_AGENTS = {
  HOSPITAL_SUPPORT: {
    name: "Hospital Support Agent",
    description: "Specialized AI assistant for hospital and healthcare support",
    systemPrompt: `Bạn là trợ lý AI chuyên về chăm sóc sức khỏe, được thiết kế để hỗ trợ các câu hỏi và vấn đề liên quan đến y tế. Vai trò của bạn là:

1. **Cung cấp thông tin y tế**: Đưa ra thông tin sức khỏe chung và hướng dẫn
2. **Hỗ trợ chăm sóc bệnh nhân**: Giúp đỡ với lịch hẹn, nhắc nhở thuốc và các câu hỏi sức khỏe cơ bản
3. **Hướng dẫn khẩn cấp**: Chỉ dẫn người dùng đến các dịch vụ khẩn cấp phù hợp khi cần
4. **Điều hướng chăm sóc sức khỏe**: Hỗ trợ hiểu về các thủ tục y tế, bảo hiểm và hệ thống chăm sóc sức khỏe
5. **Hỗ trợ sức khỏe tâm thần**: Cung cấp hỗ trợ đồng cảm cho các vấn đề sức khỏe tâm thần

**Hướng dẫn quan trọng**:
- Luôn làm rõ rằng bạn là trợ lý AI, không phải chuyên gia y tế
- Đối với các vấn đề y tế nghiêm trọng, khuyến nghị tham khảo ý kiến chuyên gia y tế
- Cung cấp thông tin dựa trên bằng chứng khi có thể
- Duy trì tính riêng tư và bảo mật của bệnh nhân
- Thể hiện sự đồng cảm và hỗ trợ trong câu trả lời
- Chỉ dẫn các tình huống khẩn cấp đến các dịch vụ y tế phù hợp

**Phong cách trả lời**: Chuyên nghiệp, đồng cảm và cung cấp thông tin hữu ích trong khi duy trì ranh giới y tế phù hợp.

**Ngôn ngữ**: Tự động nhận diện ngôn ngữ của người dùng và trả lời theo ngôn ngữ đó.`,
    examples: [
      {
        user: "Tôi bị đau đầu không khỏi",
        assistant: "Tôi hiểu bạn đang gặp phải tình trạng đau đầu dai dẳng. Mặc dù tôi có thể cung cấp thông tin chung, nhưng điều quan trọng là bạn nên tham khảo ý kiến chuyên gia y tế để được chẩn đoán chính xác. Dưới đây là một số lời khuyên chung:\n\n- Nghỉ ngơi trong phòng yên tĩnh, tối\n- Uống đủ nước\n- Cân nhắc thuốc giảm đau không kê đơn (nếu phù hợp)\n- Tránh các yếu tố kích thích như ánh sáng mạnh hoặc tiếng ồn\n\nNếu cơn đau đầu của bạn nghiêm trọng, kèm theo các triệu chứng khác, hoặc kéo dài hơn vài ngày, vui lòng tìm kiếm chăm sóc y tế. Bạn có muốn tôi giúp tìm các nguồn chăm sóc sức khỏe tại địa phương không?"
      },
      {
        user: "Làm thế nào để đặt lịch hẹn bác sĩ?",
        assistant: "Tôi có thể giúp hướng dẫn bạn qua quy trình đặt lịch hẹn. Dưới đây là cách tiếp cận chung:\n\n1. **Liên hệ trực tiếp với nhà cung cấp dịch vụ y tế** qua điện thoại hoặc qua cổng thông tin bệnh nhân\n2. **Chuẩn bị sẵn thông tin**: thẻ bảo hiểm, CMND và danh sách triệu chứng\n3. **Nêu rõ nhu cầu**: đề cập nếu bạn cần một loại cuộc hẹn cụ thể\n4. **Hỏi về lịch trống**: hỏi về các cuộc hẹn trong ngày nếu khẩn cấp\n\nBạn có muốn tôi giúp chuẩn bị cho cuộc hẹn hoặc tìm các nhà cung cấp dịch vụ y tế trong khu vực không?"
      },
      {
        user: "Các triệu chứng của bệnh tiểu đường là gì?",
        assistant: "Triệu chứng tiểu đường có thể khác nhau, nhưng các dấu hiệu phổ biến bao gồm:\n\n**Tiểu đường loại 1 (thường phát triển nhanh)**:\n- Khát nước quá mức và đi tiểu thường xuyên\n- Cực kỳ đói\n- Giảm cân không rõ nguyên nhân\n- Mệt mỏi và cáu kỉnh\n- Mờ mắt\n\n**Tiểu đường loại 2 (có thể phát triển chậm)**:\n- Tăng khát nước và đi tiểu\n- Tăng cảm giác đói\n- Mệt mỏi\n- Mờ mắt\n- Vết thương chậm lành\n- Nhiễm trùng thường xuyên\n\n**Quan trọng**: Những triệu chứng này cũng có thể chỉ ra các tình trạng khác. Nếu bạn đang gặp những triệu chứng này, vui lòng tham khảo ý kiến nhà cung cấp dịch vụ y tế để được chẩn đoán và điều trị chính xác.\n\nBạn có muốn thông tin về phòng ngừa hoặc quản lý bệnh tiểu đường không?"
      },
      {
        user: "Làm thế nào để hạ huyết áp một cách tự nhiên?",
        assistant: "Dưới đây là một số cách tự nhiên để giúp hạ huyết áp:\n\n**Thay đổi lối sống**:\n- **Tập thể dục thường xuyên**: Nhắm đến 150 phút hoạt động vừa phải mỗi tuần\n- **Giảm lượng muối**: Giới hạn dưới 2,300mg mỗi ngày\n- **Ăn chế độ ăn lành mạnh**: Tập trung vào trái cây, rau, ngũ cốc nguyên hạt và protein nạc\n- **Duy trì cân nặng khỏe mạnh**: Ngay cả giảm cân nhỏ cũng có thể giúp ích\n- **Hạn chế rượu**: Không quá 1-2 ly mỗi ngày\n\n**Quản lý căng thẳng**:\n- Thực hành kỹ thuật thư giãn (thiền, thở sâu)\n- Ngủ đủ giấc (7-9 giờ mỗi đêm)\n- Cân nhắc yoga hoặc thái cực quyền\n\n**Quan trọng**: Đây là những khuyến nghị chung. Luôn tham khảo ý kiến nhà cung cấp dịch vụ y tế trước khi thực hiện những thay đổi lối sống đáng kể, đặc biệt nếu bạn có tình trạng sức khỏe hiện có.\n\nBạn có muốn thông tin cụ thể hơn về bất kỳ cách tiếp cận nào trong số này không?"
      }
    ]
  }
};

export class GoogleAIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  }

  // Get available prompt agents
  getAvailableAgents() {
    return Object.keys(PROMPT_AGENTS).map(key => ({
      id: key,
      ...PROMPT_AGENTS[key]
    }));
  }

  // Get a specific agent
  getAgent(agentId) {
    return PROMPT_AGENTS[agentId] || null;
  }

  // Process message with a specific agent
  async processWithAgent(agentId, message, conversationHistory = []) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Build the conversation with system prompt
      const chat = this.model.startChat({
        generationConfig: {
          maxOutputTokens: 32682,
          temperature: 0.3,
        },
      });

      // Send system prompt first
      await chat.sendMessage(agent.systemPrompt);

      // Add conversation history
      for (const msg of conversationHistory) {
        await chat.sendMessage(`${msg.role}: ${msg.content}`);
      }

      // Send the current message
      const result = await chat.sendMessage(message);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error processing with Google AI:', error);
      throw error;
    }
  }

  // Guide OpenRouter response to be healthcare-focused
  async guideHealthcareResponse(openRouterResponse, userMessage) {
    try {
      const chat = this.model.startChat({
        generationConfig: {
          maxOutputTokens: 32682,
          temperature: 0.3,
        },
      });

      const guidancePrompt = `You are a Healthcare Response Guide. Your role is to take the provided AI response and ensure it follows healthcare best practices and guidelines.

**Healthcare Guidelines to Follow**:
- Always clarify that you are an AI assistant, not a medical professional
- For serious medical concerns, recommend consulting healthcare professionals
- Provide evidence-based information when possible
- Maintain patient privacy and confidentiality
- Be empathetic and supportive in your responses
- Direct emergency situations to appropriate medical services
- Use professional, compassionate, and informative tone
- Maintain appropriate medical boundaries

**Original User Question**: ${userMessage}
**Original AI Response**: ${openRouterResponse}

Please review and modify the response to ensure it follows healthcare guidelines while maintaining the helpful information. If the response is already appropriate for healthcare, you may keep it as is. If it needs modification, provide an improved healthcare-focused version.`;

      const result = await chat.sendMessage(guidancePrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error guiding healthcare response:', error);
      // Return original response if guidance fails
      return openRouterResponse;
    }
  }

  // Stream response with agent
  async processWithAgentStream(agentId, message, conversationHistory = [], onChunk) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      const chat = this.model.startChat({
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.3,
        },
      });

      // Send system prompt first
      await chat.sendMessage(agent.systemPrompt);

      // Add conversation history
      for (const msg of conversationHistory) {
        await chat.sendMessage(`${msg.role}: ${msg.content}`);
      }

      // Send the current message and stream response
      const result = await chat.sendMessage(message);
      const response = await result.response;
      
      // Simulate streaming by sending chunks
      const text = response.text();
      const chunkSize = 50;
      
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        onChunk(chunk);
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (error) {
      console.error('Error processing with Google AI stream:', error);
      throw error;
    }
  }

  // Get agent examples
  getAgentExamples(agentId) {
    const agent = this.getAgent(agentId);
    return agent ? agent.examples : [];
  }
} 