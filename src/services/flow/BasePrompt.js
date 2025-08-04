// Base Prompt - Cấu trúc chung cho tất cả prompt
export class BasePrompt {
  constructor() {
    this.language = 'vi'; // Mặc định tiếng Việt
    this.tone = 'professional';
    this.context = '';
  }

  // Thiết lập ngôn ngữ
  setLanguage(lang) {
    this.language = lang;
    return this;
  }

  // Thiết lập tone
  setTone(tone) {
    this.tone = tone;
    return this;
  }

  // Thiết lập context
  setContext(context) {
    this.context = context;
    return this;
  }

  // Tạo prompt cơ bản
  createBasePrompt() {
    const toneConfig = this.getToneConfig();

    return `Bạn là một trợ lý AI chuyên về chăm sóc sức khỏe. 

${toneConfig.instruction}

${this.context}

**Hướng dẫn quan trọng:**
- Tự động nhận diện ngôn ngữ của người dùng và trả lời theo ngôn ngữ đó
- Sử dụng tone ${toneConfig.name}
- Cung cấp thông tin chính xác và hữu ích
- Luôn khuyến nghị người dùng tham khảo ý kiến chuyên gia y tế
- Duy trì tính bảo mật và riêng tư của người dùng
- Sử dụng markdown để định dạng câu trả lời đẹp mắt

**Cấu trúc câu trả lời:**
1. Phần mở đầu thân thiện
2. Thông tin chính xác và chi tiết
3. Khuyến nghị và hướng dẫn
4. Lưu ý quan trọng về việc tham khảo chuyên gia
5. Kết luận hỗ trợ`;
  }

  // Cấu hình ngôn ngữ
  getLanguageConfig() {
    const configs = {
      vi: {
        name: 'tiếng Việt',
        instruction: 'Hãy trả lời bằng tiếng Việt một cách rõ ràng, dễ hiểu và thân thiện.',
        greeting: 'Xin chào! Tôi là trợ lý AI chuyên về chăm sóc sức khỏe.',
        disclaimer: '**Lưu ý quan trọng:** Thông tin này chỉ mang tính chất tham khảo. Vui lòng tham khảo ý kiến chuyên gia y tế để được tư vấn chính xác.',
        conclusion: 'Nếu bạn có thêm câu hỏi hoặc cần hỗ trợ khác, đừng ngần ngại hỏi tôi nhé!'
      },
      en: {
        name: 'English',
        instruction: 'Please respond in clear, understandable, and friendly English.',
        greeting: 'Hello! I am an AI assistant specialized in healthcare.',
        disclaimer: '**Important Note:** This information is for reference only. Please consult healthcare professionals for accurate advice.',
        conclusion: 'If you have additional questions or need other support, feel free to ask me!'
      }
    };
    return configs[this.language] || configs.vi;
  }

  // Cấu hình tone
  getToneConfig() {
    const configs = {
      professional: {
        name: 'chuyên nghiệp',
        instruction: 'Sử dụng ngôn ngữ chuyên nghiệp, đáng tin cậy và dễ hiểu.'
      },
      friendly: {
        name: 'thân thiện',
        instruction: 'Sử dụng ngôn ngữ thân thiện, gần gũi nhưng vẫn chuyên nghiệp.'
      },
      empathetic: {
        name: 'đồng cảm',
        instruction: 'Sử dụng ngôn ngữ đồng cảm, hiểu biết và hỗ trợ.'
      }
    };
    return configs[this.tone] || configs.professional;
  }
} 