// Theme management utilities
export const getTheme = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('theme') || 'dark';
  }
  return 'dark';
};

export const setTheme = (theme) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
};

export const toggleTheme = () => {
  const currentTheme = getTheme();
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
  return newTheme;
};

// Initialize theme on app load
export const initializeTheme = () => {
  const theme = getTheme();
  setTheme(theme);
}; 