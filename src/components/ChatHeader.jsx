import React from 'react';
import { Bell, ChevronDown, HelpCircle, HeartPulse, Menu, Moon, SlidersHorizontal, Sun, Trash2 } from 'lucide-react';

export default function ChatHeader({ onClearChat, hasMessages, onToggleSidebar, theme, onToggleTheme, freshness, onOpenControls }) {
  const fresh = freshness?.level === 'fresh';
  return (
    <header className="app-topbar">
      <div className="brand-block">
        <button className="icon-button mobile-only" onClick={onToggleSidebar} aria-label="Open navigation"><Menu size={18}/></button>
        <div className="brand-mark"><HeartPulse size={19}/></div>
        <div><strong>Potential Medical AI</strong><span>Automatic evidence routing</span></div>
      </div>

      <div className={`freshness-pill ${fresh ? 'is-fresh' : ''}`}>
        <i/>
        <div><strong>{fresh ? 'Knowledge fresh' : `Knowledge ${freshness?.level || 'checking'}`}</strong><span>{freshness?.checkedAt ? new Date(freshness.checkedAt).toLocaleString() : 'Awaiting source verification'}</span></div>
      </div>

      <div className="topbar-actions">
        <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
        <button className="icon-button" aria-label="Help"><HelpCircle size={17}/></button>
        <button className="icon-button" aria-label="Notifications"><Bell size={17}/></button>
        {hasMessages && <button className="icon-button danger" onClick={onClearChat} aria-label="Clear conversation"><Trash2 size={17}/></button>}
        <button className="profile-chip" type="button" onClick={onOpenControls} aria-label="Open assistant controls">
          <span>DR</span>
          <div><strong>Medical workspace</strong><small>Private session</small></div>
          <ChevronDown size={14}/>
        </button>
        <button type="button" className="icon-button controls-mobile" onClick={onOpenControls} aria-label="Open assistant controls"><SlidersHorizontal size={17}/></button>
      </div>
    </header>
  );
}
