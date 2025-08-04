import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

const ChatInput = ({ onSendMessage, isLoading, placeholder = "Type your message...", disabled = false, exampleMessage = null }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isLoading && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Handle example message
  useEffect(() => {
    if (exampleMessage) {
      setMessage(exampleMessage);
    }
  }, [exampleMessage]);

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="chat-input-wrapper">
          <div className="chat-textarea-container">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading || disabled}
              className={cn(
                "chat-textarea",
                (isLoading || disabled) && "opacity-50 cursor-not-allowed"
              )}
              rows={1}
            />
          </div>
          
          <button
            type="submit"
            disabled={!message.trim() || isLoading || disabled}
            className={cn(
              "btn-ai flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            )}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin sm:w-5 sm:h-5" />
            ) : (
              <Send size={18} className="sm:w-5 sm:h-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInput; 