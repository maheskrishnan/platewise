const STORAGE_KEY = 'foodSelections';

const DEFAULT_VISIBLE_KEYS = new Set([
  'serving_grams',
  'calories',
  'protein_g',
  'fat_g',
  'carbs_g',
  'fiber_g',
  'cholesterol_mg',
]);

const state = {
  allFoods: [],
  selectedIds: [],
  mode: 'per100g',
  searchTerm: '',
  vitaminKeys: [],
  mineralKeys: [],
  hiddenColumns: new Set(),
  columnsInitialized: false,
  sortKey: 'food',
  sortDirection: 'asc',
};

const elements = {
  selectionTags: document.getElementById('selectionTags'),
  compareTable: document.getElementById('compareTable'),
  modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
  compareNavBadge: document.getElementById('compareNavBadge'),
  searchInput: document.getElementById('compareSearch'),
  searchResults: document.getElementById('compareSearchResults'),
  columnControls: document.getElementById('columnControls'),
  columnModal: document.getElementById('columnModal'),
  openColumnModal: document.getElementById('openColumnModal'),
  closeColumnModal: document.getElementById('closeColumnModal'),
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
  return Math.round(number * 100) / 100;
};

const titleCase = (text) =>
  text
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const UNIT_SUFFIX_MAP = {
  _mg: { cell: ' mg', header: 'mg' },
  _ug: { cell: ' mcg', header: 'mcg' },
  _g: { cell: ' g', header: 'g' },
  _iu: { cell: ' IU', header: 'IU' },
};

const formatWithUnit = (key, value) => {
  const entry = Object.entries(UNIT_SUFFIX_MAP).find(([suffix]) =>
    key.endsWith(suffix)
  );
  const unit = entry ? entry[1].cell : '';
  return `${formatNumber(value)}${unit}`;
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

const compareFields = [
  { key: 'serving_grams', label: 'Grams' },
  { key: 'calories', label: 'Calories (kcal)' },
  { key: 'protein_g', label: 'Protein (g)' },
  { key: 'fat_g', label: 'Total fat (g)' },
  { key: 'saturated_g', label: 'Saturated fat (g)' },
  { key: 'monounsaturated_g', label: 'Monounsaturated fat (g)' },
  { key: 'polyunsaturated_g', label: 'Polyunsaturated fat (g)' },
  { key: 'omega_3_g', label: 'Omega-3 (g)' },
  { key: 'omega_6_g', label: 'Omega-6 (g)' },
  { key: 'carbs_g', label: 'Carbs (g)' },
  { key: 'fiber_g', label: 'Fiber (g)' },
  { key: 'cholesterol_mg', label: 'Cholesterol (mg)' },
];

const getFoodById = (id) => state.allFoods.find((food) => food.id === id);

const getFieldNumericValue = (food, key) => {
  const factor = getNormalizationFactor(food);
  if (factor === null) return null;
  if (key === 'serving_grams') {
    return 100 * factor;
  }
  if (key === 'calories' && state.mode === 'per100cal') {
    return 100;
  }
  const raw = food[key];
  if (typeof raw !== 'number') return null;
  return raw * factor;
};

const getMicroNumericValue = (food, groupKey, nutrientKey) => {
  const source = food[groupKey];
  if (!source || typeof source[nutrientKey] !== 'number') return null;
  const factor = getNormalizationFactor(food);
  if (factor === null) return null;
  return source[nutrientKey] * factor;
};

const getNormalizationFactor = (food) => {
  if (state.mode === 'per100cal') {
    if (!food.calories || food.calories <= 0) return null;
    return 100 / food.calories;
  }
  if (state.mode === 'per454g') {
    return 454 / 100;
  }
  return 1;
};

const getFieldValue = (food, key) => {
  if (key === 'serving_grams') {
    const factor = getNormalizationFactor(food);
    if (factor === null) return '—';
    return `${formatNumber(100 * factor)} g`;
  }

  if (key === 'calories' && state.mode === 'per100cal') {
    return formatNumber(100);
  }

  const raw = food[key];
  if (typeof raw !== 'number') return raw;
  const factor = getNormalizationFactor(food);
  if (factor === null) return '—';
  return formatNumber(raw * factor);
};

const renderSelectionTags = () => {
  const container = elements.selectionTags;
  container.innerHTML = '';

  if (!state.selectedIds.length) {
    container.innerHTML =
      '<p class="helper-text">No foods selected. Visit the <a href="index.html">Food Library</a>.</p>';
    elements.compareTable.innerHTML = '';
    updateCompareNavBadge();
    return;
  }

  state.selectedIds.forEach((id) => {
    const food = getFoodById(id);
    if (!food) return;
    const tag = document.createElement('span');
    tag.className = 'selection-tag';
    tag.innerHTML = `
      ${food.name}
      <button aria-label="Remove ${food.name}">&times;</button>
    `;
    tag.querySelector('button').addEventListener('click', () => {
      toggleSelection(id);
    });
    container.appendChild(tag);
  });
  updateCompareNavBadge();
};

const ensureColumnDefaults = () => {
  if (state.columnsInitialized) return;
  const allKeys = [
    ...compareFields.map((field) => field.key),
    ...state.vitaminKeys.map((key) => `vitamin:${key}`),
    ...state.mineralKeys.map((key) => `mineral:${key}`),
  ];
  allKeys.forEach((key) => {
    if (
      !DEFAULT_VISIBLE_KEYS.has(key) &&
      !key.startsWith('vitamin:') &&
      !key.startsWith('mineral:')
    ) {
      state.hiddenColumns.add(key);
    }
  });
  state.vitaminKeys.forEach((key) =>
    state.hiddenColumns.add(`vitamin:${key}`)
  );
  state.mineralKeys.forEach((key) =>
    state.hiddenColumns.add(`mineral:${key}`)
  );
  state.columnsInitialized = true;
};

const formatMicroHeader = (key) => {
  const entry = Object.entries(UNIT_SUFFIX_MAP).find(([suffix]) =>
    key.endsWith(suffix)
  );
  const unitLabel = entry ? entry[1].header : '';
  const base = key.replace(/_(mg|ug|g|iu)$/i, '');
  const label = titleCase(base);
  return unitLabel ? `${label} (${unitLabel})` : label;
};

const getMicroValue = (food, groupKey, nutrientKey) => {
  const source = food[groupKey];
  if (!source || source[nutrientKey] === undefined) return '—';
  const factor = getNormalizationFactor(food);
  if (factor === null) return '—';
  return formatWithUnit(nutrientKey, source[nutrientKey] * factor);
};

const getSortValue = (food, key) => {
  if (key === 'food') {
    return (food.name || '').toLowerCase();
  }
  if (key.startsWith('vitamin:')) {
    return getMicroNumericValue(food, 'vitamins', key.split(':')[1]);
  }
  if (key.startsWith('mineral:')) {
    return getMicroNumericValue(food, 'minerals', key.split(':')[1]);
  }
  return getFieldNumericValue(food, key);
};

const collectMicroKeys = (foods, key) => {
  const set = new Set();
  foods.forEach((food) => {
    const group = food[key];
    if (!group) return;
    Object.keys(group).forEach((nutrient) => set.add(nutrient));
  });
  return Array.from(set).sort();
};

const updateCompareNavBadge = () => {
  if (!elements.compareNavBadge) return;
  const count = state.selectedIds.length;
  elements.compareNavBadge.textContent = count;
  elements.compareNavBadge.classList.toggle('hidden', count === 0);
};

const renderSearchResults = () => {
  if (!elements.searchResults) return;
  const container = elements.searchResults;

  const term = state.searchTerm.trim().toLowerCase();
  const available = state.allFoods.filter(
    (food) => !state.selectedIds.includes(food.id)
  );

  if (!term) {
    container.innerHTML = '';
    return;
  }
  const matches = available
    .filter((food) => food.name.toLowerCase().includes(term))
    .slice(0, 5);

  if (!matches.length) {
    container.innerHTML =
      '<p class="helper-text">No foods match your search.</p>';
    return;
  }

  container.innerHTML = '';
  matches.forEach((food) => {
    const row = document.createElement('div');
    row.className = 'search-result';
    row.innerHTML = `
      <div class="info">
        <span class="name">${food.name}</span>
        <span class="category">${food.categoryLabel}</span>
      </div>
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'compare-btn';
    button.textContent = 'Add';
    button.addEventListener('click', () => {
      toggleSelection(food.id);
    });
    row.appendChild(button);
    container.appendChild(row);
  });
};

const bindSortHandlers = () => {
  const buttons = elements.compareTable.querySelectorAll('.table-sort');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const { sortKey } = button.dataset;
      if (!sortKey) return;
      if (state.sortKey === sortKey) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = sortKey;
        state.sortDirection = sortKey === 'food' ? 'asc' : 'desc';
      }
      renderCompareTable();
    });
  });
};

const renderCompareTable = () => {
  const container = elements.compareTable;
  container.innerHTML = '';

  if (!state.selectedIds.length) {
    container.innerHTML =
      '<p class="helper-text">Select foods to unlock the detailed comparison table.</p>';
    return;
  }

  const selectedFoods = state.selectedIds
    .map((id) => getFoodById(id))
    .filter(Boolean);

  if (!selectedFoods.length) {
    container.innerHTML =
      '<p class="helper-text">Selected foods are missing from the dataset.</p>';
    return;
  }

  const visibleSortKeys = new Set(['food']);
  const createHeaderButton = (label, key) => {
    const isActive = state.sortKey === key;
    const indicator = isActive
      ? state.sortDirection === 'asc'
        ? '▲'
        : '▼'
      : '↕';
    const activeClass = isActive ? ' active' : '';
    return `<button class="table-sort${activeClass}" type="button" data-sort-key="${key}">${label}<span class="sort-indicator">${indicator}</span></button>`;
  };

  const nutrientHeaders = compareFields
    .filter((field) => !state.hiddenColumns.has(field.key))
    .map((field) => {
      visibleSortKeys.add(field.key);
      return `<th>${createHeaderButton(field.label, field.key)}</th>`;
    })
    .join('');
  const vitaminHeaders = state.vitaminKeys
    .filter((key) => !state.hiddenColumns.has(`vitamin:${key}`))
    .map((key) => {
      const columnKey = `vitamin:${key}`;
      visibleSortKeys.add(columnKey);
      return `<th>${createHeaderButton(formatMicroHeader(key), columnKey)}</th>`;
    })
    .join('');
  const mineralHeaders = state.mineralKeys
    .filter((key) => !state.hiddenColumns.has(`mineral:${key}`))
    .map((key) => {
      const columnKey = `mineral:${key}`;
      visibleSortKeys.add(columnKey);
      return `<th>${createHeaderButton(formatMicroHeader(key), columnKey)}</th>`;
    })
    .join('');

  if (!visibleSortKeys.has(state.sortKey)) {
    state.sortKey = 'food';
    state.sortDirection = 'asc';
  }

  const sortedFoods = [...selectedFoods].sort((a, b) => {
    const aValue = getSortValue(a, state.sortKey);
    const bValue = getSortValue(b, state.sortKey);
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    const direction = state.sortDirection === 'asc' ? 1 : -1;
    if (typeof aValue === 'string' || typeof bValue === 'string') {
      const aStr = typeof aValue === 'string' ? aValue : String(aValue);
      const bStr = typeof bValue === 'string' ? bValue : String(bValue);
      return aStr.localeCompare(bStr) * direction;
    }
    return (aValue - bValue) * direction;
  });

  const bodyRows = sortedFoods
    .map((food) => {
      const nutrientCells = compareFields
        .filter((field) => !state.hiddenColumns.has(field.key))
        .map((field) => `<td>${getFieldValue(food, field.key)}</td>`)
        .join('');
      const vitaminCells = state.vitaminKeys
        .filter((key) => !state.hiddenColumns.has(`vitamin:${key}`))
        .map((key) => `<td>${getMicroValue(food, 'vitamins', key)}</td>`)
        .join('');
      const mineralCells = state.mineralKeys
        .filter((key) => !state.hiddenColumns.has(`mineral:${key}`))
        .map((key) => `<td>${getMicroValue(food, 'minerals', key)}</td>`)
        .join('');
      return `
        <tr>
          <td>
            <div class="food-meta">
              <span class="food-name">${food.name}</span>
            </div>
          </td>
          ${nutrientCells}
          ${vitaminCells}
          ${mineralCells}
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="compare-table__wrapper">
      <table>
        <thead>
          <tr>
            <th>${createHeaderButton('Food', 'food')}</th>
            ${nutrientHeaders}
            ${vitaminHeaders}
            ${mineralHeaders}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
  bindSortHandlers();
};

const toggleSelection = (foodId) => {
  const index = state.selectedIds.indexOf(foodId);
  if (index >= 0) {
    state.selectedIds.splice(index, 1);
  } else {
    state.selectedIds.push(foodId);
  }
  persistSelections();
  renderSelectionTags();
  renderCompareTable();
  renderSearchResults();
};

const updateModeButtons = () => {
  elements.modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.mode);
  });
};

const initModeEvents = () => {
  elements.modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      if (mode && mode !== state.mode) {
        state.mode = mode;
        updateModeButtons();
        renderCompareTable();
      }
    });
  });
  updateModeButtons();
};

const renderColumnControls = () => {
  if (!elements.columnControls) return;
  const container = elements.columnControls;
  container.innerHTML = '';

  const sectionsWrapper = document.createElement('div');
  sectionsWrapper.className = 'column-modal__sections';
  container.appendChild(sectionsWrapper);

  const createSection = (title, description) => {
    const section = document.createElement('div');
    section.className = 'column-modal__section';
    const heading = document.createElement('h4');
    heading.textContent = title;
    section.appendChild(heading);
    if (description) {
      const desc = document.createElement('p');
      desc.textContent = description;
      section.appendChild(desc);
    }
    const grid = document.createElement('div');
    grid.className = 'column-checkboxes';
    section.appendChild(grid);
    sectionsWrapper.appendChild(section);
    return grid;
  };

  const createToggle = (grid, key, label) => {
    const labelEl = document.createElement('label');
    labelEl.className = 'column-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !state.hiddenColumns.has(key);
    input.addEventListener('change', () => {
      if (input.checked) {
        state.hiddenColumns.delete(key);
      } else {
        state.hiddenColumns.add(key);
      }
      renderCompareTable();
    });
    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(label));
    grid.appendChild(labelEl);
  };

  const coreGrid = createSection('Core nutrients', 'Macros and key energy metrics');
  compareFields.forEach((field) => createToggle(coreGrid, field.key, field.label));

  if (state.vitaminKeys.length) {
    const vitaminGrid = createSection('Vitamins', 'Micronutrients with vitamin classification');
    state.vitaminKeys.forEach((key) =>
      createToggle(vitaminGrid, `vitamin:${key}`, formatMicroHeader(key))
    );
  }

  if (state.mineralKeys.length) {
    const mineralGrid = createSection('Minerals', 'Mineral content per selection');
    state.mineralKeys.forEach((key) =>
      createToggle(mineralGrid, `mineral:${key}`, formatMicroHeader(key))
    );
  }
};

const initColumnModal = () => {
  if (!elements.columnModal) return;

  const open = () => {
    elements.columnModal.classList.remove('hidden');
    elements.columnModal.setAttribute('aria-hidden', 'false');
    renderColumnControls();
  };

  const close = () => {
    elements.columnModal.classList.add('hidden');
    elements.columnModal.setAttribute('aria-hidden', 'true');
  };

  if (elements.openColumnModal) {
    elements.openColumnModal.addEventListener('click', open);
  }

  if (elements.closeColumnModal) {
    elements.closeColumnModal.addEventListener('click', close);
  }

  elements.columnModal.addEventListener('click', (event) => {
    if (event.target === elements.columnModal) {
      close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.columnModal.classList.contains('hidden')) {
      close();
    }
  });
};

const bootstrap = async () => {
  try {
    const foods = await fetchJson('/api/foods');
    state.allFoods = foods;
    state.selectedIds = loadSelections();
    state.vitaminKeys = collectMicroKeys(foods, 'vitamins');
    state.mineralKeys = collectMicroKeys(foods, 'minerals');
    ensureColumnDefaults();
    renderSelectionTags();
    renderCompareTable();
    renderSearchResults();
    renderColumnControls();
    initColumnModal();
    if (elements.searchInput) {
      let debounce;
      elements.searchInput.addEventListener('input', (event) => {
        clearTimeout(debounce);
        const value = event.target.value;
        debounce = setTimeout(() => {
          state.searchTerm = value;
          renderSearchResults();
        }, 150);
      });
    }
    initModeEvents();
    initColumnModal();
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        state.selectedIds = loadSelections();
        renderSelectionTags();
        renderCompareTable();
        renderSearchResults();
      }
    });
  } catch (error) {
    console.error(error);
    elements.compareTable.innerHTML =
      '<p class="empty-state">Unable to load comparison data. Please refresh.</p>';
  }
};

bootstrap();
