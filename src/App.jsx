import React,{useEffect,useRef,useState} from 'react';
import ChatHeader from './components/ChatHeader';
import AssistantControlPanel from './components/AssistantControlPanel';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import ChatSidebar from './components/ChatSidebar';
import WelcomeMessage from './components/WelcomeMessage';
import { medicalApi } from './services/apiClient';
import { ChatHistoryService } from './services/chatHistory';
import { getTheme,initializeTheme,toggleTheme } from './utils/theme';

export default function App(){
 const [messages,setMessages]=useState([]),[isLoading,setIsLoading]=useState(false),[historyService,setHistoryService]=useState(null),[platformStatus,setPlatformStatus]=useState(null),[connectionError,setConnectionError]=useState(''),[chats,setChats]=useState([]),[currentChatId,setCurrentChatId]=useState(null),[sidebarOpen,setSidebarOpen]=useState(false),[theme,setTheme]=useState('light'),[ready,setReady]=useState(false),[example,setExample]=useState(null),[controlsOpen,setControlsOpen]=useState(false),[sessionToken,setSessionToken]=useState(()=>sessionStorage.getItem('medical-user-session')||''),[attachmentIds,setAttachmentIds]=useState([]); const endRef=useRef(null);
 useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages]);
 useEffect(()=>{initializeTheme();setTheme(getTheme())},[]);
 useEffect(()=>{const service=new ChatHistoryService();setHistoryService(service);let live=true;const health=async()=>{try{const status=await medicalApi.health();if(!live)return;setPlatformStatus(status);setReady(status.status==='ok');setConnectionError(status.status==='ok'?'':'Knowledge plane is stale or unavailable.')}catch(e){if(live){setConnectionError('Không thể kết nối chat gateway hoặc knowledge plane.');setReady(false)}}};health();const timer=setInterval(health,15000);return()=>{live=false;clearInterval(timer)}},[]);
 const loadChats=async()=>{if(historyService)setChats(await historyService.getAllChats())}; useEffect(()=>{loadChats()},[historyService]);
 const ensureChat=async()=>{if(currentChatId)return currentChatId;const chat=await historyService.createChat();setChats(p=>[chat,...p]);setCurrentChatId(chat.id);return chat.id};
 const send=async(message)=>{if(!historyService||!ready||isLoading)return;let chatId;setExample(null);try{chatId=await ensureChat();const user={role:'user',content:message};await historyService.addMessage(chatId,user);setMessages(p=>[...p,user,{role:'assistant',content:'',isTyping:true}]);setIsLoading(true);const history=[...messages.map(({role,content})=>({role,content})),user];let streamed='';const result=await medicalApi.streamChat(message,history,chunk=>{streamed+=chunk;setMessages(p=>{const next=[...p];next[next.length-1]={role:'assistant',content:streamed,isTyping:false};return next})},{token:sessionToken,attachmentIds,locale:'auto'});const finalText=result.text||streamed||'No response was generated.';setMessages(p=>{const next=[...p];next[next.length-1]={role:'assistant',content:finalText};return next});await historyService.addMessage(chatId,{role:'assistant',content:finalText});await loadChats();if(result.metadata?.freshness)setPlatformStatus(p=>({...p,knowledge:{...(p?.knowledge||{}),freshness:result.metadata.freshness}}));setConnectionError(result.error||'')}catch(e){const text='Chat gateway hoặc knowledge plane đang không khả dụng. Hệ thống không dùng kiến thức cục bộ để trả lời thay thế.';setMessages(p=>{const next=[...p];if(next.at(-1)?.role==='assistant')next[next.length-1]={role:'assistant',content:text};else next.push({role:'assistant',content:text});return next});setConnectionError(e.message)}finally{setIsLoading(false)}};
 const newChat=async()=>{const chat=await historyService.createChat();setChats(p=>[chat,...p]);setCurrentChatId(chat.id);setMessages([]);setSidebarOpen(false)};
 const selectChat=async id=>{setMessages(await historyService.getChatMessages(id));setCurrentChatId(id);setSidebarOpen(false)};
 const deleteChat=async id=>{await historyService.deleteChat(id);setChats(p=>p.filter(c=>c.id!==id));if(id===currentChatId){setCurrentChatId(null);setMessages([])}};
 const clear=async()=>{if(currentChatId)await historyService.clearChatMessages(currentChatId);setMessages([]);loadChats()};
 const updateTitle=async(id,title)=>{await historyService.updateChatTitle(id,title);loadChats()};
 const changeToken=value=>{setSessionToken(value);value?sessionStorage.setItem('medical-user-session',value):sessionStorage.removeItem('medical-user-session')};
 const freshness=platformStatus?.knowledge?.freshness;
 return <div className="medical-app">
   <ChatHeader onClearChat={clear} hasMessages={messages.length>0} onToggleSidebar={()=>setSidebarOpen(v=>!v)} theme={theme} onToggleTheme={()=>setTheme(toggleTheme())} freshness={freshness}/>
   <div className="app-body">
    {sidebarOpen&&<button className="mobile-scrim" onClick={()=>setSidebarOpen(false)} aria-label="Close navigation"/>}
    <ChatSidebar chats={chats} currentChatId={currentChatId} onSelectChat={selectChat} onNewChat={newChat} onDeleteChat={deleteChat} onUpdateChatTitle={updateTitle} isOpen={sidebarOpen} onClose={()=>setSidebarOpen(false)}/>
    <main className="conversation-pane">
      <div className="conversation-scroll"><div className="conversation-width">{messages.length===0?<WelcomeMessage onExampleClick={setExample}/>:messages.map((m,i)=><ChatMessage key={`${m.role}-${i}`} message={m.content} isUser={m.role==='user'} isTyping={m.isTyping}/>)}<div ref={endRef}/></div></div>
      <ChatInput onSendMessage={send} isLoading={isLoading} disabled={!ready} exampleMessage={example} placeholder={ready?'Ask a clinical question…':'Waiting for verified knowledge freshness…'} onOpenControls={()=>setControlsOpen(true)}/>
    </main>
    <aside className="desktop-control-preview">
      <div className="preview-head"><div><strong>Assistant controls</strong><span>Context, evidence & sharing</span></div><button onClick={()=>setControlsOpen(true)}>Manage</button></div>
      <div className="preview-card"><span className="eyebrow">Patient context</span><strong>{sessionToken?'Secure session connected':'Connect a secure session'}</strong><p>Add consented medications, allergies, diagnoses and locale.</p></div>
      <div className="preview-card"><span className="eyebrow">Evidence attachments</span><strong>{attachmentIds.length} selected</strong><p>Encrypted uploads with extraction confidence and citations.</p><button onClick={()=>setControlsOpen(true)}>Manage evidence</button></div>
      <div className="preview-card timeline-mini"><span className="eyebrow">Governed workflow</span><ul><li><i/>Freshness checked</li><li><i/>Server-side safety</li><li><i/>Clinician sharing audited</li></ul></div>
      <div className="preview-card"><span className="eyebrow">System boundary</span><p>No model keys, RAG, diagnosis engine or medical fallback runs in the browser.</p></div>
    </aside>
   </div>
   <footer className="app-footer"><span>100% server-side clinical processing</span><i/> <span>No local clinical fallback</span><i/> <span>Versioned evidence and citations</span></footer>
   <AssistantControlPanel open={controlsOpen} onClose={()=>setControlsOpen(false)} token={sessionToken} onTokenChange={changeToken} messages={messages} selectedAttachmentIds={attachmentIds} onSelectedAttachmentIdsChange={setAttachmentIds}/>
   {connectionError&&<div className="toast-error"><strong>Medical platform unavailable</strong><span>{connectionError}</span></div>}
 </div>
}
