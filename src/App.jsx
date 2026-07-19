import React, { useEffect, useRef, useState } from 'react';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import ChatSidebar from './components/ChatSidebar';
import WelcomeMessage from './components/WelcomeMessage';
import { medicalApi } from './services/apiClient';
import { ChatHistoryService } from './services/chatHistory';
import { getTheme, initializeTheme, toggleTheme } from './utils/theme';

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistoryService, setChatHistoryService] = useState(null);
  const [platformStatus, setPlatformStatus] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setThemeState] = useState('dark');
  const [isPlatformReady, setIsPlatformReady] = useState(false);
  const [exampleMessage, setExampleMessage] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    initializeTheme();
    setThemeState(getTheme());
  }, []);

  useEffect(() => {
    const history = new ChatHistoryService();
    setChatHistoryService(history);
    let active = true;

    const refreshHealth = async () => {
      try {
        const status = await medicalApi.health();
        if (!active) return;
        setPlatformStatus(status);
        setIsPlatformReady(status.status === 'ok');
        setConnectionError(status.status === 'ok' ? '' : 'Knowledge plane is stale or unavailable.');
      } catch (error) {
        if (!active) return;
        console.error('Service health check failed:', error);
        setConnectionError('Không thể kết nối chat gateway hoặc knowledge plane. Hãy chạy npm run start:platform.');
        setIsPlatformReady(false);
      }
    };

    refreshHealth();
    const timer = setInterval(refreshHealth, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const loadChats = async () => {
    if (!chatHistoryService) return;
    try {
      setChats(await chatHistoryService.getAllChats());
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  useEffect(() => {
    loadChats();
  }, [chatHistoryService]);

  const createChatIfNeeded = async () => {
    if (currentChatId) return currentChatId;
    const newChat = await chatHistoryService.createChat();
    setChats((previous) => [newChat, ...previous]);
    setCurrentChatId(newChat.id);
    return newChat.id;
  };

  const handleSendMessage = async (message) => {
    if (!chatHistoryService || !isPlatformReady || isLoading) return;
    setExampleMessage(null);
    let chatId;

    try {
      chatId = await createChatIfNeeded();
      const userMessage = { role: 'user', content: message };
      await chatHistoryService.addMessage(chatId, userMessage);
      setMessages((previous) => [...previous, userMessage, { role: 'assistant', content: '', isTyping: false }]);
      setIsLoading(true);

      const conversationHistory = [
        ...messages.map(({ role, content }) => ({ role, content })),
        userMessage
      ];
      let streamingResponse = '';
      const result = await medicalApi.streamChat(message, conversationHistory, (chunk) => {
        streamingResponse += chunk;
        setMessages((previous) => {
          const next = [...previous];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: streamingResponse };
          return next;
        });
      });

      const finalContent = result.text || streamingResponse || 'No response was generated.';
      setMessages((previous) => {
        const next = [...previous];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: finalContent };
        return next;
      });
      await chatHistoryService.addMessage(chatId, { role: 'assistant', content: finalContent });
      await loadChats();
      if (result.metadata?.freshness) {
        setPlatformStatus((previous) => ({
          ...(previous || {}),
          knowledge: { ...(previous?.knowledge || {}), freshness: result.metadata.freshness }
        }));
      }
      setConnectionError(result.error || '');
    } catch (error) {
      console.error('Error sending message:', error);
      const errorContent = 'Chat gateway hoặc knowledge plane đang không khả dụng. Hệ thống không dùng kiến thức cục bộ để tạo câu trả lời thay thế.';
      setMessages((previous) => {
        const next = previous.filter((item) => !item.isTyping);
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && !last.content) next[next.length - 1] = { ...last, content: errorContent };
        else next.push({ role: 'assistant', content: errorContent });
        return next;
      });
      if (chatId) {
        try {
          await chatHistoryService.addMessage(chatId, { role: 'assistant', content: errorContent });
        } catch {
          // Preserve the visible error when chat persistence is unavailable.
        }
      }
      setConnectionError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = async () => {
    const newChat = await chatHistoryService.createChat();
    setChats((previous) => [newChat, ...previous]);
    setCurrentChatId(newChat.id);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSelectChat = async (chatId) => {
    setMessages(await chatHistoryService.getChatMessages(chatId));
    setCurrentChatId(chatId);
    setSidebarOpen(false);
  };

  const handleDeleteChat = async (chatId) => {
    await chatHistoryService.deleteChat(chatId);
    setChats((previous) => previous.filter((chat) => chat.id !== chatId));
    if (currentChatId === chatId) {
      setCurrentChatId(null);
      setMessages([]);
    }
  };

  const handleClearChat = async () => {
    if (currentChatId && chatHistoryService) {
      await chatHistoryService.clearChatMessages(currentChatId);
      await loadChats();
    }
    setMessages([]);
  };

  const handleUpdateChatTitle = async (chatId, newTitle) => {
    await chatHistoryService.updateChatTitle(chatId, newTitle);
    await loadChats();
  };

  const freshness = platformStatus?.knowledge?.freshness;

  return (
    <div className="chat-container">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

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

      <div className="chat-main">
        <ChatHeader
          onClearChat={handleClearChat}
          hasMessages={messages.length > 0}
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          theme={theme}
          onToggleTheme={() => setThemeState(toggleTheme())}
        />

        <div className="chat-messages">
          <div className="chat-messages-content">
            {messages.length === 0 ? (
              <WelcomeMessage onExampleClick={setExampleMessage} />
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className="slide-in-up">
                    <ChatMessage message={message.content} isUser={message.role === 'user'} isTyping={message.isTyping} />
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder={isPlatformReady ? 'Nhập câu hỏi sức khỏe của bạn...' : 'Đang chờ knowledge plane đạt freshness SLO...'}
          disabled={!isPlatformReady}
          exampleMessage={exampleMessage}
        />
      </div>

      {connectionError && (
        <div className="fixed bottom-2 right-2 sm:bottom-4 sm:right-4 bg-red-50 border border-red-200 rounded-lg shadow-lg p-3 sm:p-4 max-w-xs sm:max-w-sm z-50">
          <h3 className="text-xs sm:text-sm font-medium text-red-800">Medical platform unavailable</h3>
          <p className="text-xs sm:text-sm text-red-700 mt-1">{connectionError}</p>
          <p className="text-xs text-red-600 mt-2">Không có fallback kiến thức cục bộ.</p>
        </div>
      )}

      {freshness && freshness.level !== 'fresh' && !connectionError && (
        <div className="fixed bottom-4 right-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          Knowledge freshness: {freshness.level}. Clinical answers may be blocked by fail-closed policy.
        </div>
      )}
    </div>
  );
}

export default App;
