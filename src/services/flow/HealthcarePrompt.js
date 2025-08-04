// Healthcare Prompt - Các prompt chuyên biệt cho chăm sóc sức khỏe
import { BasePrompt } from './BasePrompt.js';

export class HealthcarePrompt extends BasePrompt {
  constructor() {
    super();
    this.setContext('Bạn chuyên về tư vấn sức khỏe, cung cấp thông tin y tế và hỗ trợ người dùng.');
  }

  // Prompt cho tư vấn triệu chứng
  createSymptomConsultationPrompt(userQuery, symptoms = []) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về triệu chứng sức khỏe.

**Câu hỏi của người dùng:** "${userQuery}"

${symptoms.length > 0 ? `**Triệu chứng được phát hiện:** ${symptoms.join(', ')}` : ''}

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Phân tích triệu chứng một cách khoa học
3. Cung cấp thông tin về nguyên nhân có thể
4. Đưa ra khuyến nghị về việc tự chăm sóc (nếu phù hợp)
5. Nhấn mạnh tầm quan trọng của việc tham khảo chuyên gia
6. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
7. Kết luận hỗ trợ

**Lưu ý:** Tự động nhận diện và trả lời theo ngôn ngữ của người dùng.`;
  }

  // Prompt cho tư vấn thuốc
  createMedicationPrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về thuốc và điều trị.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Cung cấp thông tin chung về thuốc/điều trị
3. Giải thích cơ chế hoạt động (nếu phù hợp)
4. Cảnh báo về tác dụng phụ và tương tác
5. Nhấn mạnh tầm quan trọng của việc tuân thủ chỉ định bác sĩ
6. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
7. Kết luận hỗ trợ

**Lưu ý:** Không đưa ra chẩn đoán cụ thể, chỉ cung cấp thông tin tham khảo.`;
  }

  // Prompt cho tư vấn dinh dưỡng
  createNutritionPrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về dinh dưỡng và chế độ ăn.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Cung cấp thông tin về dinh dưỡng và chế độ ăn
3. Đưa ra khuyến nghị về thực phẩm và cách chế biến
4. Giải thích lợi ích sức khỏe
5. Lưu ý về chế độ ăn đặc biệt (nếu có)
6. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
7. Kết luận hỗ trợ

**Lưu ý:** Tập trung vào thông tin dinh dưỡng chung, không đưa ra chế độ ăn cụ thể cho bệnh lý.`;
  }

  // Prompt cho tư vấn tâm lý
  createMentalHealthPrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về sức khỏe tâm thần và tâm lý.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Thể hiện sự đồng cảm và hiểu biết
3. Cung cấp thông tin về sức khỏe tâm thần
4. Đưa ra lời khuyên về cách chăm sóc tâm lý
5. Khuyến khích tìm kiếm sự hỗ trợ chuyên môn khi cần
6. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
7. Kết luận hỗ trợ

**Lưu ý:** Sử dụng tone đồng cảm, không đưa ra chẩn đoán tâm lý.`;
  }

  // Prompt cho khẩn cấp y tế
  createEmergencyPrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về tình huống khẩn cấp y tế.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Đánh giá mức độ khẩn cấp
3. Cung cấp hướng dẫn sơ cứu cơ bản (nếu phù hợp)
4. Nhấn mạnh tầm quan trọng của việc gọi cấp cứu
5. Hướng dẫn các bước cần thiết
6. **QUAN TRỌNG:** Luôn khuyến nghị tìm kiếm chăm sóc y tế ngay lập tức
7. Kết luận hỗ trợ

**Lưu ý:** Ưu tiên an toàn, luôn khuyến nghị tìm kiếm chăm sóc y tế chuyên nghiệp.`;
  }

  // Prompt cho thông tin bệnh lý
  createDiseaseInfoPrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về thông tin bệnh lý.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Cung cấp thông tin chung về bệnh lý
3. Giải thích nguyên nhân và yếu tố nguy cơ
4. Mô tả triệu chứng và dấu hiệu
5. Thông tin về chẩn đoán và điều trị
6. Khuyến nghị về phòng ngừa
7. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
8. Kết luận hỗ trợ

**Lưu ý:** Chỉ cung cấp thông tin giáo dục, không đưa ra chẩn đoán cụ thể.`;
  }

  // Prompt cho tư vấn lối sống
  createLifestylePrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về lối sống lành mạnh.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Cung cấp thông tin về lối sống lành mạnh
3. Đưa ra khuyến nghị về tập thể dục và dinh dưỡng
4. Hướng dẫn về quản lý stress và giấc ngủ
5. Thông tin về phòng ngừa bệnh tật
6. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
7. Kết luận hỗ trợ

**Lưu ý:** Tập trung vào lối sống tích cực và phòng ngừa.`;
  }

  // Prompt cho câu hỏi chung
  createGeneralHealthPrompt(userQuery) {
    return `${this.createBasePrompt()}

**Ngữ cảnh cụ thể:** Người dùng đang hỏi về sức khỏe nói chung.

**Câu hỏi của người dùng:** "${userQuery}"

**Hướng dẫn trả lời:**
1. Chào hỏi thân thiện bằng ngôn ngữ của người dùng
2. Trả lời câu hỏi một cách chính xác và hữu ích
3. Cung cấp thông tin bổ sung liên quan
4. Đưa ra khuyến nghị phù hợp
5. Thêm lưu ý quan trọng về việc tham khảo chuyên gia y tế
6. Kết luận hỗ trợ

**Lưu ý:** Tự động nhận diện và trả lời theo ngôn ngữ của người dùng.`;
  }
} 