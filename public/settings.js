const DEFAULT_SETTINGS = {
  defaultCompareMode: 'per100g',
  defaultRecipeOrder: 'default',
  collapseNotes: false,
  showMicros: true,
  theme: 'default',
};

const STORAGE_KEY = 'userSettings';

const state = {
  settings: { ...DEFAULT_SETTINGS },
};

const elements = {
  form: document.getElementById('settingsForm'),
  reset: document.getElementById('resetSettings'),
};

const applyTheme = () => {
  document.body.classList.remove('theme-nightshade', 'theme-default');
  const theme = state.settings.theme || 'default';
  document.body.classList.add(`theme-${theme}`);
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
};

const loadSettings = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const persistSettings = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch (error) {
    console.error('Failed to save settings', error);
  }
};

const applySettingsToForm = () => {
  if (!elements.form) return;
  const form = elements.form;
  if (form.elements.defaultCompareMode) {
    form.elements.defaultCompareMode.value =
      state.settings.defaultCompareMode;
  }
  if (form.elements.defaultRecipeOrder) {
    form.elements.defaultRecipeOrder.value =
      state.settings.defaultRecipeOrder;
  }
  if (form.elements.collapseNotes) {
    form.elements.collapseNotes.checked = Boolean(
      state.settings.collapseNotes
    );
  }
  if (form.elements.showMicros) {
    form.elements.showMicros.checked = Boolean(state.settings.showMicros);
  }
  const themeInputs = form.elements.theme;
  if (themeInputs) {
    const list =
      typeof themeInputs.length === 'number'
        ? Array.from(themeInputs)
        : [themeInputs];
    const currentTheme = state.settings.theme || 'default';
    list.forEach((input) => {
      input.checked = input.value === currentTheme;
    });
  }
};

const handleSubmit = (event) => {
  event.preventDefault();
  const data = new FormData(elements.form);
  state.settings.defaultCompareMode = data.get('defaultCompareMode');
  state.settings.defaultRecipeOrder = data.get('defaultRecipeOrder');
  state.settings.collapseNotes = data.get('collapseNotes') === 'on';
  state.settings.showMicros = data.get('showMicros') === 'on';
  const themeInputs = elements.form.elements.theme;
  if (themeInputs) {
    const list =
      typeof themeInputs.length === 'number'
        ? Array.from(themeInputs)
        : [themeInputs];
    const selected = list.find((input) => input.checked);
    state.settings.theme = selected ? selected.value : 'default';
  } else {
    state.settings.theme = data.get('theme') || 'default';
  }
  persistSettings();
  const notice = document.createElement('p');
  notice.className = 'helper-text';
  notice.textContent = 'Settings saved.';
  elements.form.appendChild(notice);
  applyTheme();
  setTimeout(() => notice.remove(), 2000);
};

const handleReset = () => {
  state.settings = { ...DEFAULT_SETTINGS };
  persistSettings();
  applySettingsToForm();
  applyTheme();
};

const bootstrap = () => {
  state.settings = loadSettings();
  applySettingsToForm();
  applyTheme();
  elements.form?.addEventListener('submit', handleSubmit);
  elements.reset?.addEventListener('click', handleReset);
};

bootstrap();
