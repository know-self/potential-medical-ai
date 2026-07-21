import React, { useCallback, useEffect, useRef, useState } from 'react';
import AssistantControlPanel from './components/AssistantControlPanel';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import ChatSidebar from './components/ChatSidebar';
import EvidenceWorkspace from './components/EvidenceWorkspace';
import WelcomeMessage from './components/WelcomeMessage';
import { isAuthenticationError, medicalApi } from './services/apiClient';
import { ChatHistoryService } from './services/chatHistory';
import { clearModelSettings, loadModelSettings, modelSettingsReady, saveModelSettings } from './services/modelSettings';
import { emptySessionWorkspace, loadSessionWorkspace } from './services/sessionWorkspace';
import { getTheme, initializeTheme, toggleTheme } from './utils/theme';

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
  const [gatewayReady, setGatewayReady] = useState(false);
  const [example, setExample] = useState(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [activeView, setActiveView] = useState('chat');
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem('medical-user-session') || '');
  const [modelSettings, setModelSettings] = useState(() => loadModelSettings());
  const [attachmentIds, setAttachmentIds] = useState([]);
  const [workspaceData, setWorkspaceData] = useState(emptySessionWorkspace);
  const endRef = useRef(null);

  const modelReady = modelSettingsReady(modelSettings);
  const ready = gatewayReady && modelReady;

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
        setGatewayReady(status.status === 'ok');
        setConnectionError(status.status === 'ok' ? '' : 'Local safety gateway is unavailable.');
      } catch {
        if (live) {
          setConnectionError('Không thể kết nối local safety gateway.');
          setGatewayReady(false);
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
    setWorkspaceData(emptySessionWorkspace);
    if (notice) setSessionNotice(notice);
  }, []);

  const changeToken = useCallback((value) => {
    const next = String(value || '').trim();
    setSessionToken(next);
    if (next) sessionStorage.setItem('medical-user-session', next);
    else {
      sessionStorage.removeItem('medical-user-session');
      setAttachmentIds([]);
      setWorkspaceData(emptySessionWorkspace);
    }
    setSessionNotice('');
  }, []);

  const changeModelSettings = useCallback((value) => {
    const next = value ? saveModelSettings(value) : clearModelSettings();
    setModelSettings(next);
    setConnectionError('');
    setSessionNotice(value
      ? `Custom model saved for this tab: ${next.model} · ${next.mode}.`
      : 'Custom model settings were cleared from this tab.');
  }, []);

  const refreshWorkspaceData = useCallback(async () => {
    if (!sessionToken) {
      setWorkspaceData(emptySessionWorkspace);
      return;
    }
    try {
      setWorkspaceData(await loadSessionWorkspace(medicalApi, sessionToken));
    } catch (error) {
      if (isAuthenticationError(error)) {
        clearSession('Secure session expired or became invalid. It was removed; public chat remains available.');
        return;
      }
      setWorkspaceData(emptySessionWorkspace);
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
    if (!historyService || !ready || isLoading) {
      if (!modelReady) {
        setControlsOpen(true);
        setSessionNotice('Configure an OpenAI-compatible endpoint and model before chatting.');
      }
      return;
    }
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
          locale: 'auto',
          model: modelSettings
        });
      } catch (error) {
        if (!sessionToken || !isAuthenticationError(error)) throw error;
        clearSession('Secure session expired. This answer continued without patient context or private attachments.');
        result = await medicalApi.streamChat(message, history, onChunk, {
          token: '',
          attachmentIds: [],
          locale: 'auto',
          model: { ...modelSettings, includePatientContext: false }
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
      const text = `Custom model is unavailable: ${error.message}`;
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
  const modeLabel = modelSettings.mode === 'knowledge-rag' ? 'Knowledge RAG' : modelSettings.mode === 'document-rag' ? 'Document RAG' : 'Direct Model';

  return (
    <div className="medical-app">
      <ChatHeader
        onClearChat={clear}
        hasMessages={messages.length > 0}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
        theme={theme}
        onToggleTheme={() => setTheme(toggleTheme())}
        freshness={modelSettings.mode === 'knowledge-rag' ? freshness : null}
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
              placeholder={!modelReady ? 'Configure a custom model in Assistant controls…' : gatewayReady ? `Ask using ${modeLabel}…` : 'Waiting for local safety gateway…'}
              onOpenControls={() => setControlsOpen(true)}
            />
          </main>
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

      <footer className="app-footer"><span>{modeLabel}</span><i/><span>Custom OpenAI-compatible endpoint</span><i/><span>Safety gateway · no stored provider key</span></footer>

      <AssistantControlPanel
        open={controlsOpen}
        onClose={closeControls}
        token={sessionToken}
        onTokenChange={changeToken}
        modelSettings={modelSettings}
        onModelSettingsChange={changeModelSettings}
        messages={messages}
        selectedAttachmentIds={attachmentIds}
        onSelectedAttachmentIdsChange={setAttachmentIds}
      />

      {sessionNotice && <div className="toast-error session-warning"><strong>Assistant settings</strong><span>{sessionNotice}</span></div>}
      {connectionError && <div className="toast-error"><strong>Model or gateway unavailable</strong><span>{connectionError}</span></div>}
    </div>
  );
}
