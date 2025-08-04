// Prompt Manager - Quản lý và phân loại prompt
import { HealthcarePrompt } from './HealthcarePrompt.js';

export class PromptManager {
  constructor() {
    this.healthcarePrompt = new HealthcarePrompt();
    this.keywords = this.initializeKeywords();
  }

  // Khởi tạo từ khóa phân loại
  initializeKeywords() {
    return {
      symptoms: [
        'đau', 'sốt', 'ho', 'mệt mỏi', 'chóng mặt', 'buồn nôn', 'nôn', 'tiêu chảy',
        'táo bón', 'đau đầu', 'đau bụng', 'đau ngực', 'khó thở', 'sưng', 'phù',
        'ngứa', 'phát ban', 'symptom', 'pain', 'fever', 'cough', 'fatigue', 'dizzy',
        'nausea', 'vomit', 'diarrhea', 'constipation', 'headache', 'stomachache',
        'chest pain', 'shortness of breath', 'swelling', 'itchy', 'rash'
      ],
      medication: [
        'thuốc', 'uống thuốc', 'tác dụng phụ', 'liều lượng', 'thời gian uống',
        'tương tác thuốc', 'medication', 'medicine', 'drug', 'side effect', 'dosage',
        'drug interaction', 'prescription'
      ],
      nutrition: [
        'dinh dưỡng', 'ăn uống', 'chế độ ăn', 'thực phẩm', 'vitamin', 'khoáng chất',
        'protein', 'carbohydrate', 'fat', 'nutrition', 'diet', 'food', 'vitamin',
        'mineral', 'protein', 'carb', 'fat'
      ],
      mentalHealth: [
        'tâm lý', 'stress', 'lo âu', 'trầm cảm', 'mất ngủ', 'tâm thần', 'tâm trạng',
        'mental health', 'stress', 'anxiety', 'depression', 'insomnia', 'mood'
      ],
      emergency: [
        'khẩn cấp', 'cấp cứu', 'nguy hiểm', 'chảy máu', 'gãy xương', 'ngất xỉu',
        'đau tim', 'đột quỵ', 'emergency', 'urgent', 'dangerous', 'bleeding',
        'broken bone', 'faint', 'heart attack', 'stroke'
      ],
      disease: [
        'bệnh', 'bệnh lý', 'viêm', 'nhiễm trùng', 'ung thư', 'tiểu đường',
        'huyết áp cao', 'tim mạch', 'disease', 'illness', 'infection', 'cancer',
        'diabetes', 'hypertension', 'cardiovascular'
      ],
      lifestyle: [
        'lối sống', 'tập thể dục', 'ngủ', 'thư giãn', 'thể dục', 'vận động',
        'lifestyle', 'exercise', 'sleep', 'relax', 'workout', 'activity'
      ]
    };
  }

  // Phân loại câu hỏi dựa trên từ khóa
  classifyQuery(userQuery) {
    const query = userQuery.toLowerCase();
    const scores = {};

    // Tính điểm cho từng loại
    Object.keys(this.keywords).forEach(category => {
      scores[category] = 0;
      this.keywords[category].forEach(keyword => {
        if (query.includes(keyword.toLowerCase())) {
          scores[category]++;
        }
      });
    });

    // Tìm loại có điểm cao nhất
    const maxScore = Math.max(...Object.values(scores));
    const categories = Object.keys(scores).filter(cat => scores[cat] === maxScore);

    if (maxScore === 0) {
      return 'general';
    }

    return categories[0];
  }

  // Tạo prompt phù hợp dựa trên loại câu hỏi
  createAppropriatePrompt(userQuery, symptoms = []) {
    const category = this.classifyQuery(userQuery);
    
    switch (category) {
      case 'symptoms':
        return this.healthcarePrompt.createSymptomConsultationPrompt(userQuery, symptoms);
      
      case 'medication':
        return this.healthcarePrompt.createMedicationPrompt(userQuery);
      
      case 'nutrition':
        return this.healthcarePrompt.createNutritionPrompt(userQuery);
      
      case 'mentalHealth':
        return this.healthcarePrompt.createMentalHealthPrompt(userQuery);
      
      case 'emergency':
        return this.healthcarePrompt.createEmergencyPrompt(userQuery);
      
      case 'disease':
        return this.healthcarePrompt.createDiseaseInfoPrompt(userQuery);
      
      case 'lifestyle':
        return this.healthcarePrompt.createLifestylePrompt(userQuery);
      
      default:
        return this.healthcarePrompt.createGeneralHealthPrompt(userQuery);
    }
  }

  // Thiết lập ngôn ngữ cho tất cả prompt
  setLanguage(language) {
    this.healthcarePrompt.setLanguage(language);
    return this;
  }

  // Thiết lập tone cho tất cả prompt
  setTone(tone) {
    this.healthcarePrompt.setTone(tone);
    return this;
  }

  // Thêm từ khóa mới
  addKeyword(category, keyword) {
    if (this.keywords[category]) {
      this.keywords[category].push(keyword);
    } else {
      this.keywords[category] = [keyword];
    }
  }

  // Lấy thống kê phân loại
  getClassificationStats() {
    const stats = {};
    Object.keys(this.keywords).forEach(category => {
      stats[category] = this.keywords[category].length;
    });
    return stats;
  }

  // Kiểm tra xem prompt có phù hợp không
  validatePrompt(prompt) {
    const requiredElements = [
      'trợ lý AI',
      'chăm sóc sức khỏe',
      'thông tin',
      'khuyến nghị',
      'chuyên gia y tế'
    ];

    const promptLower = prompt.toLowerCase();
    const missingElements = requiredElements.filter(element => 
      !promptLower.includes(element.toLowerCase())
    );

    return {
      isValid: missingElements.length === 0,
      missingElements: missingElements
    };
  }
} 