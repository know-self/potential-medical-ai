import VectorStore from './VectorStore.js';

class KnowledgeBase {
  constructor(apiKey) {
    this.vectorStore = new VectorStore(apiKey);
    this.healthcareDocuments = [
      {
        id: 'diabetes-basics',
        title: 'Diabetes Management',
        content: `Diabetes is a chronic condition that affects how your body turns food into energy. There are two main types:

Type 1 Diabetes: The body doesn't produce insulin. The immune system attacks and destroys cells in the pancreas that make insulin.

Type 2 Diabetes: The body doesn't use insulin well and can't keep blood sugar at normal levels.

Common symptoms include:
- Increased thirst and frequent urination
- Increased hunger
- Weight loss
- Fatigue
- Blurred vision

Management includes:
- Regular blood sugar monitoring
- Healthy diet and exercise
- Medication as prescribed
- Regular check-ups with healthcare providers`,
        category: 'chronic_conditions',
        tags: ['diabetes', 'blood sugar', 'insulin', 'chronic disease']
      },
      {
        id: 'hypertension-guide',
        title: 'Hypertension (High Blood Pressure)',
        content: `Hypertension is when blood pressure is consistently higher than normal. Normal blood pressure is less than 120/80 mmHg.

Risk factors include:
- Age (risk increases with age)
- Family history
- Obesity
- Physical inactivity
- High salt diet
- Alcohol consumption
- Stress

Symptoms may include:
- Headaches
- Shortness of breath
- Nosebleeds
- Chest pain
- Dizziness

Treatment includes:
- Lifestyle modifications (diet, exercise, stress management)
- Medication as prescribed
- Regular blood pressure monitoring
- Regular medical check-ups`,
        category: 'cardiovascular',
        tags: ['hypertension', 'blood pressure', 'heart health', 'cardiovascular']
      },
      {
        id: 'mental-health-support',
        title: 'Mental Health Support',
        content: `Mental health is as important as physical health. Common mental health conditions include:

Anxiety Disorders:
- Excessive worry and fear
- Physical symptoms like rapid heartbeat
- Treatment includes therapy and medication

Depression:
- Persistent sadness or loss of interest
- Changes in sleep and appetite
- Treatment includes therapy, medication, and lifestyle changes

Stress Management:
- Regular exercise
- Mindfulness and meditation
- Adequate sleep
- Social support
- Professional help when needed

Crisis Resources:
- National Suicide Prevention Lifeline: 988
- Crisis Text Line: Text HOME to 741741
- Emergency services: 911`,
        category: 'mental_health',
        tags: ['mental health', 'anxiety', 'depression', 'stress', 'crisis']
      },
      {
        id: 'emergency-guidelines',
        title: 'Emergency Medical Guidelines',
        content: `Know when to seek emergency medical care:

Chest Pain:
- Severe chest pain or pressure
- Pain radiating to arm, jaw, or back
- Shortness of breath
- Seek immediate medical attention

Stroke Symptoms (FAST):
- Face: Drooping on one side
- Arms: Weakness or numbness
- Speech: Slurred or difficulty speaking
- Time: Call 911 immediately

Severe Bleeding:
- Apply direct pressure
- Elevate if possible
- Seek medical attention for deep wounds

Breathing Problems:
- Severe shortness of breath
- Blue lips or face
- Chest pain with breathing
- Seek immediate care

Head Injury:
- Loss of consciousness
- Severe headache
- Confusion or memory loss
- Seek medical evaluation`,
        category: 'emergency',
        tags: ['emergency', 'chest pain', 'stroke', 'bleeding', 'breathing']
      },
      {
        id: 'medication-safety',
        title: 'Medication Safety Guidelines',
        content: `Safe medication use is crucial for health:

General Guidelines:
- Take medications exactly as prescribed
- Don't skip doses or double up
- Store medications properly
- Keep a current medication list
- Ask questions about side effects

Common Medication Categories:

Pain Relievers:
- Follow dosage instructions
- Don't mix with alcohol
- Be aware of liver effects

Antibiotics:
- Complete the full course
- Don't share with others
- Take with or without food as directed

Blood Pressure Medications:
- Take at the same time daily
- Monitor blood pressure regularly
- Report side effects to doctor

Diabetes Medications:
- Monitor blood sugar levels
- Carry emergency glucose
- Know signs of low blood sugar`,
        category: 'medication',
        tags: ['medication', 'safety', 'prescription', 'dosage', 'side effects']
      },
      {
        id: 'nutrition-basics',
        title: 'Nutrition and Healthy Eating',
        content: `Good nutrition is fundamental to health:

Balanced Diet:
- Fruits and vegetables (5 servings daily)
- Whole grains
- Lean proteins
- Healthy fats
- Limited processed foods

Special Dietary Considerations:

Heart Health:
- Low sodium diet
- Omega-3 fatty acids
- Fiber-rich foods
- Limited saturated fats

Diabetes Management:
- Carbohydrate counting
- Regular meal timing
- Blood sugar monitoring
- Consultation with dietitian

Weight Management:
- Calorie balance
- Portion control
- Regular physical activity
- Behavioral changes

Hydration:
- 8 glasses of water daily
- More during exercise
- Monitor urine color
- Limit sugary drinks`,
        category: 'nutrition',
        tags: ['nutrition', 'diet', 'healthy eating', 'hydration', 'weight management']
      }
    ];
  }

  // Initialize knowledge base with healthcare documents
  async initialize() {
    try {
      console.log('Initializing healthcare knowledge base...');
      
      for (const doc of this.healthcareDocuments) {
        await this.vectorStore.addDocument(
          doc.id,
          doc.content,
          {
            title: doc.title,
            category: doc.category,
            tags: doc.tags
          }
        );
      }
      
      console.log(`Knowledge base initialized with ${this.vectorStore.getDocumentCount()} documents`);
      return true;
    } catch (error) {
      console.error('Error initializing knowledge base:', error);
      return false;
    }
  }

  // Search for relevant healthcare information
  async searchRelevantInfo(query, topK = 3) {
    try {
      const results = await this.vectorStore.search(query, topK, 0.6);
      return results.map(result => ({
        id: result.id,
        title: result.metadata.title,
        content: result.content,
        category: result.metadata.category,
        similarity: result.similarity
      }));
    } catch (error) {
      console.error('Error searching knowledge base:', error);
      return [];
    }
  }

  // Get context for RAG
  async getRAGContext(query) {
    const relevantDocs = await this.searchRelevantInfo(query);
    
    if (relevantDocs.length === 0) {
      return '';
    }

    let context = 'Based on the following healthcare information:\n\n';
    
    relevantDocs.forEach((doc, index) => {
      context += `${index + 1}. ${doc.title}:\n${doc.content}\n\n`;
    });

    context += 'Please use this information to provide accurate, helpful responses while always recommending professional medical consultation for specific health concerns.';
    
    return context;
  }

  // Add custom document to knowledge base
  async addCustomDocument(id, title, content, category, tags = []) {
    try {
      const success = await this.vectorStore.addDocument(id, content, {
        title,
        category,
        tags
      });
      
      if (success) {
        this.healthcareDocuments.push({
          id,
          title,
          content,
          category,
          tags
        });
      }
      
      return success;
    } catch (error) {
      console.error('Error adding custom document:', error);
      return false;
    }
  }

  // Get all document categories
  getCategories() {
    const categories = new Set(this.healthcareDocuments.map(doc => doc.category));
    return Array.from(categories);
  }

  // Get documents by category
  getDocumentsByCategory(category) {
    return this.healthcareDocuments.filter(doc => doc.category === category);
  }

  // Get knowledge base statistics
  getStats() {
    return {
      totalDocuments: this.vectorStore.getDocumentCount(),
      categories: this.getCategories().length,
      categoriesList: this.getCategories()
    };
  }

  // Check if knowledge base is ready
  isReady() {
    return this.vectorStore && this.vectorStore.isReady();
  }
}

export default KnowledgeBase; 