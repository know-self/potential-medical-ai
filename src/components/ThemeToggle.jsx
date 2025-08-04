import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '../utils/cn';

const ThemeToggle = ({ theme, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "p-2 rounded-lg transition-colors duration-200",
        "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
        "hover:bg-gray-100 dark:hover:bg-gray-800"
      )}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon size={20} />
      ) : (
        <Sun size={20} />
      )}
    </button>
  );
};

export default ThemeToggle; 