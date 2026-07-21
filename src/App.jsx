import React, { useCallback, useEffect, useRef, useState } from 'react';
import AuthPage from './components/AuthPage';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import ChatSidebar from './components/ChatSidebar';
import EvidenceWorkspace from './components/EvidenceWorkspace';
import ToolWorkspace from './components/ToolWorkspace';
import WelcomeMessage from './components/WelcomeMessage';
import { isAuthenticationError, medicalApi } from './services/apiClient';
import { ChatHistoryService } from './services/chatHistory';
import { emptySessionWorkspace, loadSessionWorkspace } from './services/sessionWorkspace';
import { getTheme, initializeTheme, toggleTheme } from './utils/theme';

const SESSION_TOKEN_KEY = 'medical-user-session';
const SESSION_EMAIL_KEY = 'medical-user-email';

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
  const [activeView, setActiveView] = useState('chat');
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem(SESSION_TOKEN_KEY) || '');
  const [accountEmail, setAccountEmail] = useState(() => sessionStorage.getItem(SESSION_EMAIL_KEY) || '');
  const [attachmentIds, setAttachmentIds] = useState([]);
  const [attachmentItems, setAttachmentItems] = useState([]);
  const [workspaceData, setWorkspaceData] = useState(emptySessionWorkspace);
  const endRef = useRef(null);
  const modelReady = platformStatus?.models?.configured === true;
  const ready = gatewayReady && modelReady;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);
  useEffect(() => { initializeTheme(); setTheme(getTheme()); }, []);
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
        if (live) { setConnectionError('Cannot connect to the local safety gateway.'); setGatewayReady(false); }
      }
    };
    health();
    const timer = setInterval(health, 15000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  const clearSession = useCallback((notice = '') => {
    setSessionToken(''); setAccountEmail('');
    sessionStorage.removeItem(SESSION_TOKEN_KEY); sessionStorage.removeItem(SESSION_EMAIL_KEY);
    setAttachmentIds([]); setAttachmentItems([]); setWorkspaceData(emptySessionWorkspace);
    if (notice) setSessionNotice(notice);
  }, []);

  const authenticate = useCallback(({ token, user }) => {
    const email = String(user?.email || '').trim();
    setSessionToken(token); setAccountEmail(email);
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    if (email) sessionStorage.setItem(SESSION_EMAIL_KEY, email);
  }, []);

  const refreshWorkspaceData = useCallback(async () => {
    if (!sessionToken) { setWorkspaceData(emptySessionWorkspace); return; }
    try { setWorkspaceData(await loadSessionWorkspace(medicalApi, sessionToken)); }
    catch (error) {
      if (isAuthenticationError(error)) { clearSession('Your secure session expired. Sign in again to continue.'); return; }
      setWorkspaceData(emptySessionWorkspace);
    }
  }, [clearSession, sessionToken]);
  useEffect(() => { refreshWorkspaceData(); }, [refreshWorkspaceData]);

  const loadChats = async () => { if (historyService) setChats(await historyService.getAllChats()); };
  useEffect(() => { loadChats(); }, [historyService]);

  const ensureChat = async () => {
    if (currentChatId) return currentChatId;
    const chat = await historyService.createChat();
    setChats((previous) => [chat, ...previous]); setCurrentChatId(chat.id);
    return chat.id;
  };

  const send = async (message) => {
    if (!historyService || !ready || isLoading) return;
    setExample(null);
    try {
      const chatId = await ensureChat();
      const user = { role: 'user', content: message };
      await historyService.addMessage(chatId, user);
      setMessages((previous) => [...previous, user, { role: 'assistant', content: '', isTyping: true }]);
      setIsLoading(true);
      const history = [...messages.map(({ role, content }) => ({ role, content })), user];
      let streamed = '';
      const result = await medicalApi.streamChat(message, history, (chunk) => {
        streamed += chunk;
        setMessages((previous) => {
          const next = [...previous]; next[next.length - 1] = { role: 'assistant', content: streamed, isTyping: false }; return next;
        });
      }, { token: sessionToken, attachmentIds, locale: 'auto' });
      const finalText = result.text || streamed || 'No response was generated.';
      setMessages((previous) => { const next = [...previous]; next[next.length - 1] = { role: 'assistant', content: finalText }; return next; });
      await historyService.addMessage(chatId, { role: 'assistant', content: finalText });
      await loadChats();
      if (result.metadata?.freshness) setPlatformStatus((previous) => ({ ...previous, knowledge: { ...(previous?.knowledge || {}), freshness: result.metadata.freshness } }));
      setConnectionError(result.error || '');
    } catch (error) {
      if (isAuthenticationError(error)) clearSession('Your secure session expired. Sign in again to continue.');
      const text = `Model request failed: ${error.message}`;
      setMessages((previous) => [...previous.filter((item) => !item.isTyping), { role: 'assistant', content: text }]);
      setConnectionError(error.message);
    } finally { setIsLoading(false); }
  };

  const newChat = async () => {
    if (!historyService) return;
    const chat = await historyService.createChat();
    setChats((previous) => [chat, ...previous]); setCurrentChatId(chat.id); setMessages([]); setAttachmentIds([]); setAttachmentItems([]); setActiveView('chat'); setSidebarOpen(false);
  };
  const selectChat = async (id) => {
    setMessages(await historyService.getChatMessages(id));
    const chat = chats.find((item) => item.id === id);
    const ids = Array.isArray(chat?.attachmentIds) ? chat.attachmentIds.slice(0, 8) : [];
    setAttachmentIds(ids);
    setAttachmentItems(workspaceData.uploads.filter((item) => ids.includes(item.id)).map((item) => ({ ...item, status: item.extraction?.warning ? 'warning' : 'ready' })));
    setCurrentChatId(id); setActiveView('chat'); setSidebarOpen(false);
  };
  const persistAttachments = async (ids, chatId = currentChatId) => {
    const targetId = chatId || await ensureChat();
    await historyService.updateChatAttachments(targetId, ids);
    setChats((previous) => previous.map((chat) => chat.id === targetId ? { ...chat, attachmentIds: ids } : chat));
  };
  const selectFiles = async (fileList) => {
    const files = [...(fileList || [])];
    const available = Math.max(0, 8 - attachmentItems.filter((item) => item.status !== 'failed').length);
    if (files.length > available) setSessionNotice(`Only ${available} more attachment${available === 1 ? '' : 's'} can be added (eight maximum).`);
    const targetChatId = files.slice(0, available).some((file) => file.size <= 10 * 1024 * 1024) ? (currentChatId || await ensureChat()) : currentChatId;
    for (const file of files.slice(0, available)) {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (file.size > 10 * 1024 * 1024) { setAttachmentItems((previous) => [...previous, { localId, filename: file.name, status: 'failed', error: 'File exceeds the 10 MB limit.' }]); continue; }
      setAttachmentItems((previous) => [...previous, { localId, filename: file.name, status: 'uploading' }]);
      try {
        const uploaded = await medicalApi.uploadFile(sessionToken, file);
        const status = uploaded.extraction?.warning ? 'warning' : 'ready';
        setAttachmentItems((previous) => previous.map((item) => item.localId === localId ? { ...uploaded, localId, status } : item));
        setAttachmentIds((previous) => { const next = [...previous, uploaded.id].slice(0, 8); persistAttachments(next, targetChatId).catch((error) => setSessionNotice(error.message)); return next; });
      } catch (error) { setAttachmentItems((previous) => previous.map((item) => item.localId === localId ? { ...item, status: 'failed', error: error.message } : item)); }
    }
    refreshWorkspaceData();
  };
  const removeAttachment = (attachment) => {
    setAttachmentItems((previous) => previous.filter((item) => (item.localId || item.id) !== (attachment.localId || attachment.id)));
    if (!attachment.id) return;
    setAttachmentIds((previous) => { const next = previous.filter((id) => id !== attachment.id); persistAttachments(next).catch((error) => setSessionNotice(error.message)); return next; });
  };
  const deleteChat = async (id) => {
    await historyService.deleteChat(id); setChats((previous) => previous.filter((chat) => chat.id !== id));
    if (id === currentChatId) { setCurrentChatId(null); setMessages([]); setAttachmentIds([]); setAttachmentItems([]); }
  };
  const clear = async () => { if (currentChatId) await historyService.clearChatMessages(currentChatId); setMessages([]); loadChats(); };
  const updateTitle = async (id, title) => { await historyService.updateChatTitle(id, title); loadChats(); };
  const navigate = (view) => { setActiveView(['chat', 'evidence', 'tools'].includes(view) ? view : 'chat'); setSidebarOpen(false); };

  if (!sessionToken) return <AuthPage onAuthenticated={authenticate} />;
  const freshness = platformStatus?.knowledge?.freshness;
  const selectedUploads = workspaceData.uploads.filter((item) => attachmentIds.includes(item.id));
  const evidenceUploads = selectedUploads.length ? selectedUploads : workspaceData.uploads;
  const placeholder = !gatewayReady ? 'Waiting for local safety gateway…' : !modelReady ? 'Set PMAI_MODEL_ENDPOINT and PMAI_MODEL_NAME in .env…' : 'Ask a medical question…';

  return <div className="medical-app">
    <ChatHeader onClearChat={clear} hasMessages={messages.length > 0} onToggleSidebar={() => setSidebarOpen((value) => !value)} theme={theme} onToggleTheme={() => setTheme(toggleTheme())} freshness={freshness} accountEmail={accountEmail} onSignOut={() => clearSession()} />
    <div className={`app-body ${activeView === 'evidence' ? 'evidence-mode' : ''}`}>
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"/>}
      <ChatSidebar chats={chats} currentChatId={currentChatId} onSelectChat={selectChat} onNewChat={newChat} onDeleteChat={deleteChat} onUpdateChatTitle={updateTitle} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} activeView={activeView} onNavigate={navigate} />
      {activeView === 'chat' && <main className="conversation-pane"><div className="conversation-scroll"><div className="conversation-width">{messages.length === 0 ? <WelcomeMessage onExampleClick={setExample}/> : messages.map((message, index) => <ChatMessage key={`${message.role}-${index}`} message={message.content} isUser={message.role === 'user'} isTyping={message.isTyping}/>)}<div ref={endRef}/></div></div><ChatInput onSendMessage={send} isLoading={isLoading} disabled={!ready} exampleMessage={example} placeholder={placeholder} authenticated attachments={attachmentItems} onSelectFiles={selectFiles} onRemoveAttachment={removeAttachment}/></main>}
      {activeView === 'evidence' && <EvidenceWorkspace messages={messages} uploads={evidenceUploads} profile={workspaceData.profile} shares={workspaceData.shares} freshness={freshness} onManage={() => navigate('tools')} onBackToChat={() => navigate('chat')} />}
      {activeView === 'tools' && <ToolWorkspace status={platformStatus} attachmentCount={attachmentIds.length} onOpenEvidence={() => navigate('evidence')} />}
    </div>
    <footer className="app-footer"><span>Automatic evidence routing</span><i/><span>Local model from .env</span><i/><span>Safety gateway · encrypted user data</span></footer>
    {sessionNotice && <div className="toast-error session-warning"><strong>Account</strong><span>{sessionNotice}</span></div>}
    {connectionError && <div className="toast-error"><strong>Gateway unavailable</strong><span>{connectionError}</span></div>}
  </div>;
}
