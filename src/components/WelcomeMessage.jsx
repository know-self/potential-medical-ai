import React from 'react';
import { Sparkles, MessageSquare, Zap, Shield } from 'lucide-react';

const WelcomeMessage = ({ onExampleClick }) => {
  const features = [
    {
      icon: <MessageSquare size={20} />,
      title: "Healthcare Support",
      description: "Get medical information and healthcare guidance"
    },
    {
      icon: <Zap size={20} />,
      title: "AI-Guided Responses",
      description: "Responses are guided to follow healthcare best practices"
    },
    {
      icon: <Shield size={20} />,
      title: "Medical Privacy",
      description: "Your health conversations are processed securely"
    }
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles size={32} className="text-white" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Welcome to Healthcare AI Assistant
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Get healthcare guidance and medical information. Ask health-related questions and receive AI-guided responses!
        </p>

        <div className="space-y-4">
          {features.map((feature, index) => (
            <div key={index} className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/20 rounded-lg flex items-center justify-center text-primary-600 dark:text-primary-400">
                {feature.icon}
              </div>
              <div className="text-left">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
          <p className="text-sm text-green-800 dark:text-green-200">
            🏥 <strong>Healthcare Focus:</strong> Ask about symptoms, medications, appointments, or general health questions!
          </p>
        </div>

        {/* Healthcare Examples */}
        <div className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
              <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">Common Health Questions</h3>
              <div className="space-y-2 text-sm text-green-700 dark:text-green-300">
                <button 
                  onClick={() => onExampleClick("What are the symptoms of diabetes?")}
                  className="block w-full text-left hover:bg-green-100 dark:hover:bg-green-900/30 p-2 rounded"
                >
                  • What are the symptoms of diabetes?
                </button>
                <button 
                  onClick={() => onExampleClick("How can I lower my blood pressure naturally?")}
                  className="block w-full text-left hover:bg-green-100 dark:hover:bg-green-900/30 p-2 rounded"
                >
                  • How can I lower my blood pressure naturally?
                </button>
                <button 
                  onClick={() => onExampleClick("What should I do if I have chest pain?")}
                  className="block w-full text-left hover:bg-green-100 dark:hover:bg-green-900/30 p-2 rounded"
                >
                  • What should I do if I have chest pain?
                </button>
              </div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Medication Support</h3>
              <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                <button 
                  onClick={() => onExampleClick("I forgot to take my medication, what should I do?")}
                  className="block w-full text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 p-2 rounded"
                >
                  • I forgot to take my medication, what should I do?
                </button>
                <button 
                  onClick={() => onExampleClick("What are the side effects of my medication?")}
                  className="block w-full text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 p-2 rounded"
                >
                  • What are the side effects of my medication?
                </button>
                <button 
                  onClick={() => onExampleClick("How do I manage medication interactions?")}
                  className="block w-full text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 p-2 rounded"
                >
                  • How do I manage medication interactions?
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeMessage; 