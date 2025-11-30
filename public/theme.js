(() => {
  const STORAGE_KEY = 'userSettings';
  const THEMES = ['default', 'nightshade'];

  const applyThemeClass = (theme) => {
    const next = THEMES.includes(theme) ? theme : 'default';
    document.body.classList.remove(...THEMES.map((t) => `theme-${t}`));
    document.body.classList.add(`theme-${next}`);
  };

  const readTheme = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return 'default';
      const parsed = JSON.parse(stored);
      return parsed?.theme || 'default';
    } catch {
      return 'default';
    }
  };

  const applyFromStorage = () => {
    applyThemeClass(readTheme());
  };

  applyFromStorage();

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      applyFromStorage();
    }
  });

  window.addEventListener('themechange', (event) => {
    if (event.detail) {
      applyThemeClass(event.detail);
    }
  });
})();
