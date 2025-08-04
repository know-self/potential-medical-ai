import React from 'react';
import { MessageSquare, Plus, Trash2, Clock } from 'lucide-react';
import { cn } from '../utils/cn';
import ChatNameEditor from './ChatNameEditor';

const ChatSidebar = ({ 
  chats, 
  currentChatId, 
  onSelectChat, 
  onNewChat, 
  onDeleteChat,
  onUpdateChatTitle,
  isOpen = false,
  onClose 
}) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Today';
    } else if (diffDays === 2) {
      return 'Yesterday';
    } else if (diffDays <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  return (
    <div className={cn(
      "chat-sidebar",
      isOpen && "open"
    )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Chat History</h2>
            <button
              onClick={onNewChat}
              className="btn-responsive p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="New Chat"
            >
              <Plus size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="p-4 sm:p-6 text-center">
                <MessageSquare size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No chats yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Start a new conversation</p>
              </div>
            ) : (
              <div className="p-1 sm:p-2">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      "group relative flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg cursor-pointer transition-colors",
                      currentChatId === chat.id
                        ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    )}
                    onClick={() => onSelectChat(chat.id)}
                  >
                    <div className="flex-shrink-0">
                      <MessageSquare 
                        size={16} 
                        className={cn(
                          "sm:w-5 sm:h-5",
                          currentChatId === chat.id ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-500"
                        )} 
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <ChatNameEditor
                          title={chat.title}
                          onSave={(newTitle) => onUpdateChatTitle(chat.id, newTitle)}
                          className="flex-1"
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {chat.messageCount} msg
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={12} className="text-gray-400 dark:text-gray-500" />
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatDate(chat.updatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      className={cn(
                        "opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600",
                        "dark:text-gray-500 dark:hover:text-red-400",
                        "hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all duration-200"
                      )}
                      title="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Chats are stored locally &nbsp;|&nbsp; <span className="font-semibold">Powered by David Bisky</span>
            </div>
          </div>
        </div>
      </div>
  );
};

export default ChatSidebar; 