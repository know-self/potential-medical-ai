import React from 'react';
import { HeartPulse, LogOut, Menu, Moon, Sun, Trash2, UserRound } from 'lucide-react';

function initials(value) {
  return String(value || 'User').split('@')[0].slice(0, 2).toUpperCase();
}

export default function ChatHeader({ onClearChat, hasMessages, onToggleSidebar, theme, onToggleTheme, freshness, accountEmail, onSignOut }) {
  const fresh = freshness?.level === 'fresh';
  return <header className="app-topbar">
    <div className="brand-block"><button className="icon-button mobile-only" onClick={onToggleSidebar} aria-label="Open navigation"><Menu size={18}/></button><div className="brand-mark"><HeartPulse size={19}/></div><div><strong>Potential Medical AI</strong><span>Automatic evidence routing</span></div></div>
    <div className={`freshness-pill ${fresh ? 'is-fresh' : ''}`}><i/><div><strong>{fresh ? 'Knowledge fresh' : `Knowledge ${freshness?.level || 'checking'}`}</strong><span>{freshness?.checkedAt ? new Date(freshness.checkedAt).toLocaleString() : 'Awaiting source verification'}</span></div></div>
    <div className="topbar-actions">
      <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
      {hasMessages && <button className="icon-button danger" onClick={onClearChat} aria-label="Clear conversation"><Trash2 size={17}/></button>}
      <div className="profile-chip"><span>{initials(accountEmail)}</span><div><strong>{accountEmail || 'Signed in'}</strong><small>Private account</small></div><UserRound size={14}/></div>
      <button className="icon-button sign-out-button" onClick={onSignOut} aria-label="Sign out"><LogOut size={17}/></button>
    </div>
  </header>;
}
