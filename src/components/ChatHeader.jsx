import React from 'react';
import { Bot, Trash2, Menu, MessageSquare } from 'lucide-react';
import { cn } from '../utils/cn';
import ThemeToggle from './ThemeToggle';

const ChatHeader = ({ 
  onClearChat, 
  hasMessages, 
  onToggleSidebar, 
  theme, 
  onToggleTheme
}) => {
  return (
    <div className="chat-header">
      <div className="chat-header-content">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Toggle sidebar"
          >
            <Menu size={18} className="sm:w-5 sm:h-5" />
          </button>
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-500 rounded-full flex items-center justify-center">
            <Bot size={16} className="text-white sm:w-5 sm:h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-ai-light">
              Healthcare AI Assistant
            </h1>
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ai-primary opacity-75" style={{backgroundColor: '#78dbff'}}></span>
                <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-ai-primary" style={{backgroundColor: '#78dbff'}}></span>
              </span>
              <span className="text-xs sm:text-sm text-ai-primary font-medium">Online</span>
            </div>
          </div>
        </div>


        <div className="flex items-center gap-1 sm:gap-2">
          {/* <ThemeToggle theme={theme} onToggle={onToggleTheme} /> */}
          {hasMessages && (
            <button
              onClick={onClearChat}
              className={cn(
                "btn-responsive p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50",
                "dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20",
                "transition-colors duration-200"
              )}
              title="Clear chat"
            >
              <Trash2 size={16} className="sm:w-4 sm:h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatHeader; 