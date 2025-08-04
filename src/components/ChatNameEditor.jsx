import React, { useState, useRef, useEffect } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { cn } from '../utils/cn';

const ChatNameEditor = ({ 
  title, 
  onSave, 
  onCancel,
  className = "" 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(title);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
    onCancel?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex-1 px-2 py-1 text-sm border rounded",
            "bg-white dark:bg-gray-800",
            "border-gray-300 dark:border-gray-600",
            "text-gray-900 dark:text-gray-100",
            "focus:outline-none focus:ring-2 focus:ring-primary-500",
            "focus:border-transparent"
          )}
          maxLength={50}
        />
        <button
          onClick={handleSave}
          className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
          title="Save"
        >
          <Check size={14} />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 group", className)}>
      <span className="flex-1 truncate text-sm font-medium">
        {title}
      </span>
      <button
        onClick={handleStartEdit}
        className={cn(
          "opacity-0 group-hover:opacity-100 p-1",
          "text-gray-400 hover:text-gray-600",
          "dark:text-gray-500 dark:hover:text-gray-300",
          "transition-opacity duration-200"
        )}
        title="Edit chat name"
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
};

export default ChatNameEditor; 