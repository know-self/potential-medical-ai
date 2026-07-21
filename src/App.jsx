import React, { useCallback, useEffect, useRef, useState } from 'react';
import AssistantControlPanel from './components/AssistantControlPanel';
import ChatControlRail from './components/ChatControlRail';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import ChatSidebar from './components/ChatSidebar';
import EvidenceWorkspace from './components/EvidenceWorkspace';
import WelcomeMessage from './components/WelcomeMessage';
import { isAuthenticationError, medicalApi } from './services/apiClient';
import { ChatHistoryService } from './services/chatHistory';
import { getTheme, initializeTheme, toggleTheme } from './utils/theme';

const emptyWorkspaceData = { profile: null, uploads: [], shares: [] };

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyService, setHistoryService] = useState(null);
  const [platformStatus, setPlatformStatus] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const [ready, setReady] = useState(false);
  const [example, setExample] = useState(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem('medical-user-session') || '');
  const [attachmentIds, setAttachmentIds] = useState([]);
  const [workspaceData, setWorkspaceData] = useState(emptyWorkspaceData);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    initializeTheme();
    setTheme(getTheme());
  }, []);

  useEffect(() => {
    if (!sessionNotice) return undefined;
    const timer = setTimeout(() => setSessionNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [sessionNotice]);

  useEffect(() => {
    const service = new ChatHistoryService();
    setHistoryService(service);
    let live = true;
    const health = async () => {
      try {
        const status = await medicalApi.health();
        if (!live) return;
        setPlatformStatus(status);
        setReady(status.status === 'ok');
        setConnectionError(status.status === 'ok' ? '' : 'Knowledge plane is stale or unavailable.');
      } catch {
        if (live) {
          setConnectionError('Không thể kết nối chat gateway hoặc knowledge plane.');
          setReady(false);
        }
      }
    };
    health();
    const timer = setInterval(health, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const clearSession = useCallback((notice = '') => {
    setSessionToken('');
    sessionStorage.removeItem('medical-user-session');
    setAttachmentIds([]);
    setWorkspaceData(emptyWorkspaceData);
    if (notice) setSessionNotice(notice);
  }, []);

  const changeToken = useCallback((value) => {
    const next = String(value || '').trim();
    setSessionToken(next);
    if (next) sessionStorage.setItem('medical-user-session', next);
    else {
      sessionStorage.removeItem('medical-user-session');
      setAttachmentIds([]);
      setWorkspaceData(emptyWorkspaceData);
    }
    setSessionNotice('');
  }, []);

  const refreshWorkspaceData = useCallback(async () => {
    if (!sessionToken) {
      setWorkspaceData(emptyWorkspaceData);
      return;
    }
    try {
      // Validate the committed token first. This prevents three concurrent 401s
      // when a stale token is restored from sessionStorage.
      const profile = await medicalApi.getProfile(sessionToken);
      const [uploads, shares] = await Promise.all([
        medicalApi.listUploads(sessionToken),
        medicalApi.listShares(sessionToken)
      ]);
      setWorkspaceData({
        profile,
        uploads: uploads.uploads || [],
        shares: shares.shares || []
      });
    } catch (error) {
      if (isAuthenticationError(error)) {
        clearSession('Secure session expired or became invalid. It was removed; public chat remains available.');
        return;
      }
      setWorkspaceData(emptyWorkspaceData);
    }
  }, [clearSession, sessionToken]);

  useEffect(() => {
    refreshWorkspaceData();
  }, [refreshWorkspaceData]);

  const loadChats = async () => {
    if (historyService) setChats(await historyService.getAllChats());
  };

  useEffect(() => {
    loadChats();
  }, [historyService]);

  const ensureChat = async () => {
    if (currentChatId) return currentChatId;
    const chat = await historyService.createChat();
    setChats((previous) => [chat, ...previous]);
    setCurrentChatId(chat.id);
    return chat.id;
  };

  const send = async (message) => {
    if (!historyService || !ready || isLoading) return;
    let chatId;
    setExample(null);
    try {
      chatId = await ensureChat();
      const user = { role: 'user', content: message };
      await historyService.addMessage(chatId, user);
      setMessages((previous) => [...previous, user, { role: 'assistant', content: '', isTyping: true }]);
      setIsLoading(true);
      const history = [...messages.map(({ role, content }) => ({ role, content })), user];
      let streamed = '';
      const onChunk = (chunk) => {
        streamed += chunk;
        setMessages((previous) => {
          const next = [...previous];
          next[next.length - 1] = { role: 'assistant', content: streamed, isTyping: false };
          return next;
        });
      };

      let result;
      try {
        result = await medicalApi.streamChat(message, history, onChunk, {
          token: sessionToken,
          attachmentIds,
          locale: 'auto'
        });
      } catch (error) {
        if (!sessionToken || !isAuthenticationError(error)) throw error;
        clearSession('Secure session expired. This answer continued without patient context or private attachments.');
        result = await medicalApi.streamChat(message, history, onChunk, {
          token: '',
          attachmentIds: [],
          locale: 'auto'
        });
      }

      const finalText = result.text || streamed || 'No response was generated.';
      setMessages((previous) => {
        const next = [...previous];
        next[next.length - 1] = { role: 'assistant', content: finalText };
        return next;
      });
      await historyService.addMessage(chatId, { role: 'assistant', content: finalText });
      await loadChats();
      if (result.metadata?.freshness) {
        setPlatformStatus((previous) => ({
          ...previous,
          knowledge: { ...(previous?.knowledge || {}), freshness: result.metadata.freshness }
        }));
      }
      setConnectionError(result.error || '');
    } catch (error) {
      const text = 'Chat gateway hoặc knowledge plane đang không khả dụng. Hệ thống không dùng kiến thức cục bộ để trả lời thay thế.';
      setMessages((previous) => {
        const next = [...previous];
        if (next.at(-1)?.role === 'assistant') next[next.length - 1] = { role: 'assistant', content: text };
        else next.push({ role: 'assistant', content: text });
        return next;
      });
      setConnectionError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = async () => {
    if (!historyService) return;
    const chat = await historyService.createChat();
    setChats((previous) => [chat, ...previous]);
    setCurrentChatId(chat.id);
    setMessages([]);
    setActiveView('chat');
    setSidebarOpen(false);
  };

  const selectChat = async (id) => {
    setMessages(await historyService.getChatMessages(id));
    setCurrentChatId(id);
    setActiveView('chat');
    setSidebarOpen(false);
  };

  const deleteChat = async (id) => {
    await historyService.deleteChat(id);
    setChats((previous) => previous.filter((chat) => chat.id !== id));
    if (id === currentChatId) {
      setCurrentChatId(null);
      setMessages([]);
    }
  };

  const clear = async () => {
    if (currentChatId) await historyService.clearChatMessages(currentChatId);
    setMessages([]);
    loadChats();
  };

  const updateTitle = async (id, title) => {
    await historyService.updateChatTitle(id, title);
    loadChats();
  };

  const navigate = (view) => {
    if (view === 'chat' || view === 'evidence') {
      setActiveView(view);
      setSidebarOpen(false);
      return;
    }
    setControlsOpen(true);
    setSidebarOpen(false);
  };

  const closeControls = () => {
    setControlsOpen(false);
    refreshWorkspaceData();
  };

  const freshness = platformStatus?.knowledge?.freshness;
  const selectedUploads = workspaceData.uploads.filter((item) => attachmentIds.includes(item.id));
  const evidenceUploads = selectedUploads.length ? selectedUploads : workspaceData.uploads;

  return (
    <div className="medical-app">
      <ChatHeader
        onClearChat={clear}
        hasMessages={messages.length > 0}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
        theme={theme}
        onToggleTheme={() => setTheme(toggleTheme())}
        freshness={freshness}
        onOpenControls={() => setControlsOpen(true)}
      />

      <div className={`app-body ${activeView === 'evidence' ? 'evidence-mode' : ''}`}>
        {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"/>}
        <ChatSidebar
          chats={chats}
          currentChatId={currentChatId}
          onSelectChat={selectChat}
          onNewChat={newChat}
          onDeleteChat={deleteChat}
          onUpdateChatTitle={updateTitle}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeView={activeView}
          onNavigate={navigate}
        />

        {activeView === 'chat' ? <>
          <main className="conversation-pane">
            <div className="conversation-scroll">
              <div className="conversation-width">
                {messages.length === 0
                  ? <WelcomeMessage onExampleClick={setExample}/>
                  : messages.map((message, index) => <ChatMessage key={`${message.role}-${index}`} message={message.content} isUser={message.role === 'user'} isTyping={message.isTyping}/>)}
                <div ref={endRef}/>
              </div>
            </div>
            <ChatInput
              onSendMessage={send}
              isLoading={isLoading}
              disabled={!ready}
              exampleMessage={example}
              placeholder={ready ? 'Ask a clinical question…' : 'Waiting for verified knowledge freshness…'}
              onOpenControls={() => setControlsOpen(true)}
            />
          </main>
          <ChatControlRail
            profile={workspaceData.profile}
            uploads={workspaceData.uploads}
            shares={workspaceData.shares}
            selectedAttachmentIds={attachmentIds}
            freshness={freshness}
            onManage={() => setControlsOpen(true)}
          />
        </> : <EvidenceWorkspace
          messages={messages}
          uploads={evidenceUploads}
          profile={workspaceData.profile}
          shares={workspaceData.shares}
          freshness={freshness}
          onManage={() => setControlsOpen(true)}
          onBackToChat={() => setActiveView('chat')}
        />}
      </div>

      <footer className="app-footer"><span>100% server-side clinical processing</span><i/><span>No local clinical fallback</span><i/><span>Versioned evidence and citations</span></footer>

      <AssistantControlPanel
        open={controlsOpen}
        onClose={closeControls}
        token={sessionToken}
        onTokenChange={changeToken}
        messages={messages}
        selectedAttachmentIds={attachmentIds}
        onSelectedAttachmentIdsChange={setAttachmentIds}
      />

      {sessionNotice && <div className="toast-error session-warning"><strong>Secure session reset</strong><span>{sessionNotice}</span></div>}
      {connectionError && <div className="toast-error"><strong>Medical platform unavailable</strong><span>{connectionError}</span></div>}
    </div>
  );
}
