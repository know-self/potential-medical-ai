import React from 'react';
import { Activity, BookOpen, Clock3, MessageCircle, Plus, Settings, ShieldCheck, Stethoscope, Trash2, Users } from 'lucide-react';
import ChatNameEditor from './ChatNameEditor';

const nav = [
  { id: 'chat', label: 'Chat', Icon: MessageCircle },
  { id: 'patients', label: 'Patients', Icon: Users },
  { id: 'evidence', label: 'Evidence', Icon: BookOpen },
  { id: 'tools', label: 'Tools', Icon: Activity },
  { id: 'settings', label: 'Settings', Icon: Settings }
];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatSidebar({ chats, currentChatId, onSelectChat, onNewChat, onDeleteChat, onUpdateChatTitle, isOpen, onClose, activeView = 'chat', onNavigate }) {
  return (
    <aside className={`navigation-rail ${isOpen ? 'open' : ''}`}>
      <div className="rail-inner">
        <button className="new-chat-button" type="button" onClick={onNewChat}><Plus size={17}/> New Chat <kbd>⌘ K</kbd></button>

        <nav className="primary-nav" aria-label="Primary navigation">
          {nav.map(({ id, label, Icon }) => <button type="button" className={activeView === id ? 'active' : ''} key={id} onClick={() => onNavigate?.(id)}><Icon size={17}/><span>{label}</span></button>)}
        </nav>

        <div className="rail-divider"/>
        <div className="section-label"><Clock3 size={15}/> Recent chats</div>
        <div className="chat-list">
          {chats.length === 0 ? <div className="empty-mini">No conversations yet.</div> : chats.map((chat) => (
            <div key={chat.id} className={`chat-row ${currentChatId === chat.id ? 'active' : ''}`} onClick={() => { onSelectChat(chat.id); onClose?.(); }}>
              <MessageCircle size={14}/>
              <div>
                <ChatNameEditor title={chat.title} onSave={(title) => onUpdateChatTitle(chat.id, title)}/>
                <small>{formatDate(chat.updatedAt) || `${chat.messageCount || 0} messages`}</small>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteChat(chat.id); }} aria-label={`Delete ${chat.title}`}><Trash2 size={13}/></button>
            </div>
          ))}
        </div>

        <div className="rail-status"><ShieldCheck size={19}/><div><strong>System Status</strong><span>Guarded services operational</span></div><i/></div>
        <div className="rail-footer"><Stethoscope size={17}/><div><strong>Potential Medical AI</strong><span>Conversational platform</span></div></div>
      </div>
    </aside>
  );
}
