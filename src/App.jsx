import React, { useState, useEffect, useRef } from 'react';
import { OpenRouterService } from './services/openrouter';
import { ChatHistoryService } from './services/chatHistory';
import { HealthcareOrchestrator } from './services/orchestrator/HealthcareOrchestrator.js';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import ChatHeader from './components/ChatHeader';
import ChatSidebar from './components/ChatSidebar';
import WelcomeMessage from './components/WelcomeMessage';
import { cn } from './utils/cn';
import { getTheme, setTheme, toggleTheme, initializeTheme } from './utils/theme';

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openRouterService, setOpenRouterService] = useState(null);
  const [chatHistoryService, setChatHistoryService] = useState(null);
  const [healthcareOrchestrator, setHealthcareOrchestrator] = useState(null);
  const [orchestratorStats, setOrchestratorStats] = useState(null);
  const [apiKeyError, setApiKeyError] = useState('');
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setThemeState] = useState('dark');
  const [selectedAgent] = useState('HOSPITAL_SUPPORT'); // Only healthcare agent
  const [isOrchestratorReady, setIsOrchestratorReady] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'end',
      inline: 'nearest'
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize theme
  useEffect(() => {
    initializeTheme();
    setThemeState(getTheme());
  }, []);

  useEffect(() => {
    const initializeServices = async () => {
      // Initialize services
      const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
      const googleApiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY;
      
      if (!openRouterApiKey || openRouterApiKey === 'your_openrouter_api_key_here') {
        setApiKeyError('Please set VITE_OPENROUTER_API_KEY in your .env file');
        return;
      }

      if (!googleApiKey || googleApiKey === 'your_google_ai_api_key_here') {
        setApiKeyError('Please set VITE_GOOGLE_AI_API_KEY in your .env file');
        return;
      }

      try {
        // Step 1: Initialize HealthcareOrchestrator first
        console.log('Initializing HealthcareOrchestrator...');
        const healthcareOrchestrator = new HealthcareOrchestrator(openRouterApiKey, googleApiKey);
        await healthcareOrchestrator.initialize();
        setHealthcareOrchestrator(healthcareOrchestrator);
        setIsOrchestratorReady(true);
        console.log('HealthcareOrchestrator initialized successfully');

        // Step 2: Initialize other services after orchestrator is ready
        console.log('Initializing other services...');
        const openRouterService = new OpenRouterService(openRouterApiKey);
        const chatHistoryService = new ChatHistoryService();
        
        
        setOpenRouterService(openRouterService);
        setChatHistoryService(chatHistoryService);
        setApiKeyError('');
        
        setOrchestratorStats(healthcareOrchestrator.getComprehensiveStats());
        console.log('All services initialized successfully');
      } catch (error) {
        console.error('Error initializing services:', error);
        setApiKeyError('Invalid API key configuration or initialization failed');
      }
    };

    initializeServices();
  }, []);

  const handleSendMessage = async (message) => {
    if (!openRouterService || !chatHistoryService || !healthcareOrchestrator || !isOrchestratorReady) {
      console.log('Services not ready:', { 
        openRouterService: !!openRouterService, 
        chatHistoryService: !!chatHistoryService, 
        healthcareOrchestrator: !!healthcareOrchestrator,
        isOrchestratorReady
      });
      return;
    }

    // Clear example message after sending
    setExampleMessage(null);

    let chatId = currentChatId;

    // Create new chat if none exists
    if (!chatId) {
      try {
        const newChat = await chatHistoryService.createChat();
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        chatId = newChat.id;
      } catch (error) {
        console.error('Error creating new chat:', error);
        return;
      }
    }

    const userMessage = { role: 'user', content: message };
    
    // Add user message to storage
    try {
      await chatHistoryService.addMessage(chatId, userMessage);
      setMessages(prev => [...prev, userMessage]);
    } catch (error) {
      console.error('Error adding user message:', error);
      return;
    }
    
    setIsLoading(true);

    try {
      // Add assistant message with empty content for streaming
      const assistantMessage = { role: 'assistant', content: '', isTyping: false };
      setMessages(prev => [...prev, assistantMessage]);

      const conversationHistory = [
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      // Initialize streaming response
      let streamingResponse = '';
      
      // Process with healthcare orchestrator with streaming
      const orchestratorResult = await healthcareOrchestrator.processUserQuery(
        message, 
        conversationHistory, 
        chatId,
        (chunk) => {
          // Handle streaming chunks - update the assistant message directly
          streamingResponse += chunk;
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              lastMessage.content = streamingResponse;
            }
            return newMessages;
          });
        }
      );
      
      // Update the assistant message with final content
      const finalContent = orchestratorResult.response || streamingResponse;
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = finalContent;
        }
        return newMessages;
      });
      
      // Add the AI response to chat history
      try {
        await chatHistoryService.addMessage(chatId, { role: 'assistant', content: finalContent });
      } catch (error) {
        console.error('Error adding assistant message:', error);
      }
      
      // Analytics processing is handled by the orchestrator in the background
      console.log('Healthcare orchestrator processing completed for chat:', chatId);

      // Reload chats to update the current chat's metadata
      await loadChats();
      
      // Update orchestrator stats
      setOrchestratorStats(healthcareOrchestrator.getComprehensiveStats());
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = { 
        role: 'assistant', 
        content: 'We are currently adapting information for you. Please wait a moment and try again.',
        isTyping: false
      };
      
      try {
        await chatHistoryService.addMessage(chatId, errorMessage);
      } catch (addError) {
        console.error('Error adding error message:', addError);
      }
      
      setMessages(prev => {
        const newMessages = prev.filter(msg => !msg.isTyping);
        return [...newMessages, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load chat history
  useEffect(() => {
    if (chatHistoryService) {
      loadChats();
    }
  }, [chatHistoryService]);

  // Load chats from storage
  const loadChats = async () => {
    try {
      const allChats = await chatHistoryService.getAllChats();
      setChats(allChats);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  // Create new chat
  const handleNewChat = async () => {
    try {
      const newChat = await chatHistoryService.createChat();
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      setMessages([]);
      setSidebarOpen(false);
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  // Select a chat
  const handleSelectChat = async (chatId) => {
    try {
      const chatMessages = await chatHistoryService.getChatMessages(chatId);
      setMessages(chatMessages);
      setCurrentChatId(chatId);
      setSidebarOpen(false);
      
      // Analytics processing is handled by the orchestrator when needed
      if (chatMessages.length > 0) {
        console.log('Chat loaded, analytics will be processed by orchestrator');
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
    }
  };

  // Delete a chat
  const handleDeleteChat = async (chatId) => {
    try {
      await chatHistoryService.deleteChat(chatId);
      setChats(prev => prev.filter(chat => chat.id !== chatId));
      
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const handleClearChat = async () => {
    if (currentChatId && chatHistoryService) {
      try {
        await chatHistoryService.clearChatMessages(currentChatId);
        setMessages([]);
        await loadChats(); // Reload chats to update message count
      } catch (error) {
        console.error('Error clearing chat:', error);
      }
    } else {
      setMessages([]);
    }
  };

  const handleToggleTheme = () => {
    const newTheme = toggleTheme();
    setThemeState(newTheme);
  };

  const handleUpdateChatTitle = async (chatId, newTitle) => {
    try {
      await chatHistoryService.updateChatTitle(chatId, newTitle);
      await loadChats(); // Reload chats to update the title
    } catch (error) {
      console.error('Error updating chat title:', error);
    }
  };

  // Agent is fixed to healthcare only

  const [exampleMessage, setExampleMessage] = useState(null);

  const handleExampleClick = (exampleText) => {
    setExampleMessage(exampleText);
  };

  // Handle orchestrator stats updates
  const handleStatsUpdate = () => {
    if (healthcareOrchestrator) {
      setOrchestratorStats(healthcareOrchestrator.getComprehensiveStats());
    }
  };

  return (
    <div className="chat-container">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <ChatSidebar
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onUpdateChatTitle={handleUpdateChatTitle}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Chat Area */}
      <div className="chat-main">
        {/* Header */}
        <ChatHeader 
          onClearChat={handleClearChat}
          hasMessages={messages.length > 0}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* Chat Messages */}
        <div className="chat-messages">
          <div className="chat-messages-content">
            {messages.length === 0 ? (
              <WelcomeMessage 
                onExampleClick={handleExampleClick}
              />
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={index} className="slide-in-up">
                    <ChatMessage
                      message={message.content}
                      isUser={message.role === 'user'}
                      isTyping={message.isTyping}
                    />
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <ChatInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder={openRouterService ? "Nhập tin nhắn của bạn..." : "Đang thiết lập kết nối..."}
          disabled={!openRouterService}
          exampleMessage={exampleMessage}
        />
      </div>

      {/* API Key Error */}
      {apiKeyError && (
        <div className="fixed bottom-2 right-2 sm:bottom-4 sm:right-4 bg-red-50 border border-red-200 rounded-lg shadow-lg p-3 sm:p-4 max-w-xs sm:max-w-sm z-50">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 bg-red-400 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-medium text-red-800">Configuration Error</h3>
              <p className="text-xs sm:text-sm text-red-700 mt-1">{apiKeyError}</p>
              <p className="text-xs text-red-600 mt-2">
                Hệ thống mất kết nối với cơ sở dữ liệu.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 