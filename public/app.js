const STORAGE_KEY = 'foodSelections';
const LIBRARY_MODE_STORAGE = 'libraryModePreference';
const USER_SETTINGS_KEY = 'userSettings';
const VALID_MODES = new Set(['per100g', 'per100cal']);
const LIBRARY_COLUMN_STORAGE = 'libraryHiddenColumns';

const COLUMN_DEFS = [
  { key: 'serving', label: 'Grams', sortKey: 'serving', section: 'Core metrics' },
  { key: 'calories', label: 'Calories (kcal)', sortKey: 'calories', section: 'Core metrics' },
  { key: 'protein', label: 'Protein (g)', sortKey: 'protein', section: 'Core metrics' },
  { key: 'fat', label: 'Total fat (g)', sortKey: 'fat', section: 'Core metrics' },
  { key: 'carbs', label: 'Carbs (g)', sortKey: 'carbs', section: 'Core metrics' },
  { key: 'fiber', label: 'Fiber (g)', sortKey: 'fiber', section: 'Core metrics' },
  { key: 'netcarb', label: 'Net carb (g)', sortKey: 'netcarb', section: 'Core metrics' },
  { key: 'vitamins', label: 'Vitamins', section: 'Micronutrients' },
  { key: 'minerals', label: 'Minerals', section: 'Micronutrients' },
];

const COLUMN_SECTIONS = [
  { title: 'Core metrics', description: 'Serving size, calories, and macros.', keys: ['serving', 'calories', 'protein', 'fat', 'carbs', 'fiber', 'netcarb'] },
  { title: 'Micronutrients', description: 'Vitamins and minerals overview.', keys: ['vitamins', 'minerals'] },
];
const state = {
  categories: [],
  allFoods: [],
  filteredFoods: [],
  activeCategories: new Set(),
  searchTerm: '',
  selectedIds: [],
  sortKey: 'name',
  sortDirection: 'asc',
  mode: 'per100g',
  hiddenColumns: new Set(),
};

const elements = {
  categoryFilters: document.getElementById('categoryFilters'),
  clearFilters: document.getElementById('clearFilters'),
  resultsCount: document.getElementById('resultsCount'),
  foodList: document.getElementById('foodList'),
  emptyState: document.getElementById('emptyState'),
  searchInput: document.getElementById('searchInput'),
  selectionSummary: document.getElementById('selectionSummary'),
  compareNavBadge: document.getElementById('compareNavBadge'),
  openCompareButton: document.getElementById('openCompareButton'),
  modeButtons: Array.from(document.querySelectorAll('[data-library-mode]')),
  libraryColumnModal: document.getElementById('libraryColumnModal'),
  libraryColumnControls: document.getElementById('libraryColumnControls'),
  openLibraryColumnModal: document.getElementById('openLibraryColumnModal'),
  closeLibraryColumnModal: document.getElementById('closeLibraryColumnModal'),
};

const fetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
};

const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return value;
  }
  if (Math.abs(number) >= 100) {
    return Math.round(number);
  }
  return Math.round(number * 10) / 10;
};

const titleCase = (text) =>
  text
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const formatWithUnit = (key, value) => {
  const suffixMap = {
    _mg: ' mg',
    _ug: ' mcg',
    _g: ' g',
    _iu: ' IU',
  };
  const entry = Object.entries(suffixMap).find(([suffix]) =>
    key.endsWith(suffix)
  );
  const unit = entry ? entry[1] : '';
  return `${formatNumber(value)}${unit}`;
};

const formatMicronutrients = (group) => {
  if (!group || !Object.keys(group).length) {
    return '—';
  }
  return Object.entries(group)
    .map(([key, value]) => `${titleCase(key)}: ${formatWithUnit(key, value)}`)
    .join(', ');
};

const loadSelections = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistSelections = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.selectedIds));
};

const loadHiddenColumns = () => {
  try {
    const stored = localStorage.getItem(LIBRARY_COLUMN_STORAGE);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return new Set(parsed);
    }
    return new Set();
  } catch {
    return new Set();
  }
};

const persistHiddenColumns = () => {
  try {
    localStorage.setItem(
      LIBRARY_COLUMN_STORAGE,
      JSON.stringify(Array.from(state.hiddenColumns))
    );
  } catch {
    // ignore
  }
};

const readUserSettings = () => {
  try {
    const stored = localStorage.getItem(USER_SETTINGS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeUserSettings = (settings) => {
  try {
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
};

const loadPreferredMode = () => {
  try {
    const stored = localStorage.getItem(LIBRARY_MODE_STORAGE);
    if (stored && VALID_MODES.has(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  const settings = readUserSettings();
  if (settings.defaultCompareMode && VALID_MODES.has(settings.defaultCompareMode)) {
    return settings.defaultCompareMode;
  }
  return 'per100g';
};

const persistMode = () => {
  try {
    localStorage.setItem(LIBRARY_MODE_STORAGE, state.mode);
  } catch {
    // ignore
  }
};

const getNormalizationFactor = (food) => {
  if (state.mode === 'per100cal') {
    if (!food.calories || food.calories <= 0) return null;
    return 100 / food.calories;
  }
  return 1;
};

const getNormalizedValue = (food, key) => {
  const factor = getNormalizationFactor(food);
  if (factor === null) return null;
  switch (key) {
    case 'calories':
      return state.mode === 'per100cal' ? 100 : Number(food.calories) || 0;
    case 'protein':
      return (Number(food.protein_g) || 0) * factor;
    case 'fat':
      return (Number(food.fat_g) || 0) * factor;
    case 'carbs':
      return (Number(food.carbs_g) || 0) * factor;
    case 'fiber':
      return (Number(food.fiber_g) || 0) * factor;
    case 'netcarb':
      return ((Number(food.carbs_g) || 0) - (Number(food.fiber_g) || 0)) * factor;
    default:
      return null;
  }
};

const formatMacroCell = (food, key, suffix = 'g') => {
  const value = getNormalizedValue(food, key);
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value)} ${suffix}`;
};

const getServingValue = (food) => {
  if (state.mode === 'per100cal') {
    const calories = Number(food.calories);
    if (!calories) return null;
    return (100 * 100) / calories;
  }
  return 100;
};

const formatServingCell = (food) => {
  const value = getServingValue(food);
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value)} g`;
};

const getSortValue = (food, key) => {
  switch (key) {
    case 'serving':
      return getServingValue(food) ?? Number.NEGATIVE_INFINITY;
    case 'calories':
      return getNormalizedValue(food, 'calories') ?? Number.NEGATIVE_INFINITY;
    case 'protein':
      return getNormalizedValue(food, 'protein') ?? Number.NEGATIVE_INFINITY;
    case 'fat':
      return getNormalizedValue(food, 'fat') ?? Number.NEGATIVE_INFINITY;
    case 'carbs':
      return getNormalizedValue(food, 'carbs') ?? Number.NEGATIVE_INFINITY;
    case 'fiber':
      return getNormalizedValue(food, 'fiber') ?? Number.NEGATIVE_INFINITY;
    case 'netcarb':
      return getNormalizedValue(food, 'netcarb') ?? Number.NEGATIVE_INFINITY;
    case 'name':
    default:
      return food.name.toLowerCase();
  }
};

const sortFoods = (foods) => {
  const dir = state.sortDirection === 'desc' ? -1 : 1;
  return [...foods].sort((a, b) => {
    const valA = getSortValue(a, state.sortKey);
    const valB = getSortValue(b, state.sortKey);

    if (typeof valA === 'string' || typeof valB === 'string') {
      return valA.localeCompare(valB) * dir;
    }

    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    if (numA === numB) return 0;
    return numA > numB ? dir : -dir;
  });
};

const renderCategories = () => {
  const container = elements.categoryFilters;
  container.innerHTML = '';

  const renderButton = (label, id = null) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-button';
    button.dataset.categoryId = id ?? '';
    const isActive = id
      ? state.activeCategories.has(id)
      : state.activeCategories.size === 0;
    if (isActive) {
      button.classList.add('active');
    }
    button.textContent = label;
    button.addEventListener('click', (event) =>
      handleCategorySelection(id, event)
    );
    container.appendChild(button);
  };

  renderButton('All foods', null);

  state.categories.forEach((cat) => {
    renderButton(`${cat.label} (${cat.count})`, cat.id);
  });
};

const handleCategorySelection = (categoryId, event) => {
  const multiSelect = event?.metaKey || event?.ctrlKey;
  if (!categoryId) {
    state.activeCategories = new Set();
  } else if (multiSelect) {
    const next = new Set(state.activeCategories);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
    }
    state.activeCategories = next;
  } else {
    const alreadyOnly =
      state.activeCategories.size === 1 && state.activeCategories.has(categoryId);
    state.activeCategories = alreadyOnly ? new Set() : new Set([categoryId]);
  }
  applyFilters();
  renderCategories();
  persistCategorySelection();
};

const applyFilters = () => {
  let foods = [...state.allFoods];
  const term = state.searchTerm.trim().toLowerCase();

  if (state.activeCategories.size) {
    foods = foods.filter((food) => state.activeCategories.has(food.categoryId));
  }

  if (term) {
    foods = foods.filter(
      (food) =>
        food.name.toLowerCase().includes(term) ||
        food.categoryLabel.toLowerCase().includes(term)
    );
  }

  ensureSortKeyVisible();
  state.filteredFoods = sortFoods(foods);
  renderFoodTable();
};

const createFoodRow = (food) => {
  const row = document.createElement('tr');

  const button = document.createElement('button');
  const isSelected = state.selectedIds.includes(food.id);
  button.type = 'button';
  button.className = `compare-btn${isSelected ? ' secondary' : ''}`;
  button.textContent = isSelected ? 'Remove' : 'Add';
  button.addEventListener('click', () => toggleSelection(food.id));

  row.innerHTML = `
    <td>
      <div class="food-meta">
        <span class="food-name">${food.name}</span>
        <span class="food-category">${food.categoryLabel}</span>
      </div>
    </td>
    ${renderVisibleCells(food)}
    <td class="action-cell"></td>
  `;
  row.querySelector('.action-cell').appendChild(button);
  return row;
};

const renderVisibleCells = (food) => {
  return COLUMN_DEFS.filter((col) => !state.hiddenColumns.has(col.key))
    .map((column) => `<td>${renderColumnCell(food, column)}</td>`)
    .join('');
};

const renderColumnCell = (food, column) => {
  switch (column.key) {
    case 'serving':
      return formatServingCell(food);
    case 'calories':
      return formatMacroCell(food, 'calories', 'kcal');
    case 'protein':
      return formatMacroCell(food, 'protein');
    case 'fat':
      return formatMacroCell(food, 'fat');
    case 'carbs':
      return formatMacroCell(food, 'carbs');
    case 'fiber':
      return formatMacroCell(food, 'fiber');
    case 'netcarb':
      return formatMacroCell(food, 'netcarb');
    case 'vitamins':
      return formatMicronutrients(food.vitamins);
    case 'minerals':
      return formatMicronutrients(food.minerals);
    default:
      return '—';
  }
};

const renderFoodTable = () => {
  const container = elements.foodList;
  container.innerHTML = '';

  if (!state.filteredFoods.length) {
    elements.resultsCount.textContent = '0 items';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.resultsCount.textContent = `${state.filteredFoods.length} items`;

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const table = document.createElement('table');
  table.className = 'food-table';
  const visibleColumns = COLUMN_DEFS.filter(
    (column) => !state.hiddenColumns.has(column.key)
  );

  const sortableHeader = (key, label) => {
    const isActive = state.sortKey === key;
    const indicator = isActive ? (state.sortDirection === 'asc' ? '↑' : '↓') : '';
    return `<th class="sortable${isActive ? ' active' : ''}" data-sort-key="${key}">
      <span>${label}</span>
      <span class="sort-indicator">${indicator}</span>
    </th>`;
  };

  table.innerHTML = `
    <thead>
      <tr>
        <th>Food</th>
        ${visibleColumns
          .map((column) =>
            column.sortKey
              ? sortableHeader(column.sortKey, column.label)
              : `<th>${column.label}</th>`
          )
          .join('')}
        <th>Actions</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  state.filteredFoods.forEach((food) => {
    tbody.appendChild(createFoodRow(food));
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);

  table.querySelectorAll('[data-sort-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDirection = key === 'name' ? 'asc' : 'desc';
      }
      state.filteredFoods = sortFoods(state.filteredFoods);
      renderFoodTable();
    });
  });
};

const toggleSelection = (foodId) => {
  const index = state.selectedIds.indexOf(foodId);
  if (index >= 0) {
    state.selectedIds.splice(index, 1);
  } else {
    state.selectedIds.push(foodId);
  }
  persistSelections();
  renderSelectionSummary();
  renderFoodTable();
};

const renderSelectionSummary = () => {
  const count = state.selectedIds.length;
  if (elements.selectionSummary) {
    elements.selectionSummary.textContent = count
      ? `${count} food${count > 1 ? 's' : ''} ready to compare.`
      : 'No foods selected yet.';
  }
  if (elements.compareNavBadge) {
    elements.compareNavBadge.textContent = count;
    elements.compareNavBadge.classList.toggle('hidden', count === 0);
  }
  if (elements.openCompareButton) {
    elements.openCompareButton.textContent = count
      ? `Go to compare view (${count})`
      : 'Go to compare view';
    elements.openCompareButton.disabled = count === 0;
  }
};

const initEvents = () => {
  elements.clearFilters.addEventListener('click', () => {
    state.activeCategories = new Set();
    state.searchTerm = '';
    state.sortKey = 'name';
    state.sortDirection = 'asc';
    elements.searchInput.value = '';
    renderCategories();
    applyFilters();
    persistCategorySelection();
  });

  let searchDebounce;
  elements.searchInput.addEventListener('input', (event) => {
    clearTimeout(searchDebounce);
    const value = event.target.value;
    searchDebounce = setTimeout(() => {
      state.searchTerm = value;
      applyFilters();
    }, 180);
  });

  if (elements.openCompareButton) {
    elements.openCompareButton.addEventListener('click', () => {
      if (!elements.openCompareButton.disabled) {
        window.location.href = 'compare.html';
      }
    });
  }

  if (elements.modeButtons.length) {
    elements.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.libraryMode;
        if (!mode || mode === state.mode || !VALID_MODES.has(mode)) return;
        state.mode = mode;
        persistMode();
        updateModeButtons();
        applyFilters();
      });
    });
  }

  if (elements.openLibraryColumnModal) {
    elements.openLibraryColumnModal.addEventListener('click', openLibraryColumnModal);
  }
  if (elements.closeLibraryColumnModal) {
    elements.closeLibraryColumnModal.addEventListener('click', closeLibraryColumnModal);
  }
  if (elements.libraryColumnModal) {
    elements.libraryColumnModal.addEventListener('click', (event) => {
      if (event.target === elements.libraryColumnModal) {
        closeLibraryColumnModal();
      }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      elements.libraryColumnModal &&
      !elements.libraryColumnModal.classList.contains('hidden')
    ) {
      closeLibraryColumnModal();
    }
  });
};

const updateModeButtons = () => {
  if (!elements.modeButtons.length) return;
  elements.modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.libraryMode === state.mode);
  });
};

const loadStoredCategories = () => {
  const settings = readUserSettings();
  if (Array.isArray(settings.libraryCategories)) {
    return new Set(settings.libraryCategories);
  }
  return new Set();
};

const persistCategorySelection = () => {
  const settings = readUserSettings();
  settings.libraryCategories = Array.from(state.activeCategories);
  writeUserSettings(settings);
};

const ensureSortKeyVisible = () => {
  const visibleSortKeys = new Set(
    COLUMN_DEFS.filter(
      (column) => column.sortKey && !state.hiddenColumns.has(column.key)
    ).map((column) => column.sortKey)
  );
  if (state.sortKey !== 'name' && !visibleSortKeys.has(state.sortKey)) {
    state.sortKey = 'name';
    state.sortDirection = 'asc';
  }
};

const openLibraryColumnModal = () => {
  if (!elements.libraryColumnModal) return;
  renderLibraryColumnControls();
  elements.libraryColumnModal.classList.remove('hidden');
  elements.libraryColumnModal.setAttribute('aria-hidden', 'false');
};

const closeLibraryColumnModal = () => {
  if (!elements.libraryColumnModal) return;
  elements.libraryColumnModal.classList.add('hidden');
  elements.libraryColumnModal.setAttribute('aria-hidden', 'true');
};

const renderLibraryColumnControls = () => {
  if (!elements.libraryColumnControls) return;
  const container = elements.libraryColumnControls;
  container.innerHTML = '';
  COLUMN_SECTIONS.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'column-modal__section';
    const heading = document.createElement('h4');
    heading.textContent = section.title;
    sectionEl.appendChild(heading);
    if (section.description) {
      const desc = document.createElement('p');
      desc.textContent = section.description;
      sectionEl.appendChild(desc);
    }
    const grid = document.createElement('div');
    grid.className = 'column-checkboxes';
    section.keys.forEach((key) => {
      const column = COLUMN_DEFS.find((col) => col.key === key);
      if (!column) return;
      const label = document.createElement('label');
      label.className = 'column-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !state.hiddenColumns.has(column.key);
      input.addEventListener('change', () => {
        if (input.checked) {
          state.hiddenColumns.delete(column.key);
        } else {
          state.hiddenColumns.add(column.key);
        }
        persistHiddenColumns();
        ensureSortKeyVisible();
        applyFilters();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(column.label));
      grid.appendChild(label);
    });
    sectionEl.appendChild(grid);
    container.appendChild(sectionEl);
  });
};

const bootstrap = async () => {
  try {
    const [categories, foods] = await Promise.all([
      fetchJson('/api/categories'),
      fetchJson('/api/foods'),
    ]);
    state.categories = categories;
    state.allFoods = foods;
    state.filteredFoods = foods;
    state.selectedIds = loadSelections();
    state.mode = loadPreferredMode();
    state.hiddenColumns = loadHiddenColumns();
    const storedCategories = loadStoredCategories();
    const validIds = new Set(state.categories.map((cat) => cat.id));
    state.activeCategories = new Set(
      Array.from(storedCategories).filter((id) => validIds.has(id))
    );

    renderCategories();
    renderSelectionSummary();
    updateModeButtons();
    applyFilters();
    initEvents();
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        state.selectedIds = loadSelections();
        renderSelectionSummary();
        renderFoodTable();
      }
    });
  } catch (error) {
    console.error(error);
    elements.foodList.innerHTML =
      '<p class="empty-state">Unable to load foods. Please refresh.</p>';
  }
};

bootstrap();
