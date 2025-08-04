import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/cn';

const ChatMessage = ({ message, isUser, isTyping = false }) => {
  const currentTime = new Date().toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });

  return (
    <div className={cn(
      "chat-message",
      isUser ? "user" : "assistant"
    )}>
      {isTyping ? (
        <div className="typing-indicator">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
      ) : (
        <>
          <div className="chat-message-bubble">
            {isUser ? (
              <div className="whitespace-pre-wrap break-words">
                {message}
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headings
                    h1: ({ children }) => <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-bold mb-1 text-gray-900 dark:text-gray-100">{children}</h3>,
                    
                    // Paragraphs with streaming support
                    p: ({ children }) => (
                      <p className="mb-2 text-gray-700 dark:text-gray-300 leading-relaxed transition-opacity duration-100">
                        {children}
                      </p>
                    ),
                    
                    // Bold text
                    strong: ({ children }) => <strong className="font-bold text-gray-900 dark:text-gray-100">{children}</strong>,
                    
                    // Italic text
                    em: ({ children }) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                    
                    // Code blocks
                    code: ({ children, className }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-sm font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                          {children}
                        </code>
                      );
                    },
                    
                    // Code blocks with language
                    pre: ({ children }) => (
                      <pre className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-3 rounded-lg text-sm font-mono overflow-x-auto mb-3">
                        {children}
                      </pre>
                    ),
                    
                    // Lists
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 text-gray-700 dark:text-gray-300">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 text-gray-700 dark:text-gray-300">{children}</ol>,
                    li: ({ children }) => <li className="text-gray-700 dark:text-gray-300">{children}</li>,
                    
                    // Links
                    a: ({ children, href }) => (
                      <a 
                        href={href} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
                      >
                        {children}
                      </a>
                    ),
                    
                    // Blockquotes
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-primary-300 dark:border-primary-600 pl-4 italic text-gray-600 dark:text-gray-400 mb-2">
                        {children}
                      </blockquote>
                    ),
                    
                    // Tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-3">
                        <table className="min-w-full border border-gray-300 dark:border-gray-600 rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-gray-50 dark:bg-gray-700">{children}</thead>,
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children }) => <tr className="border-b border-gray-200 dark:border-gray-600">{children}</tr>,
                    th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{children}</td>,
                    
                    // Horizontal rule
                    hr: () => <hr className="border-gray-300 dark:border-gray-600 my-4" />,
                  }}
                >
                  {message}
                </ReactMarkdown>
              </div>
            )}
          </div>
          <div className="chat-message-time">
            {currentTime}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatMessage; 