const STORAGE_KEY = 'foodSelections';
const state = {
  categories: [],
  allFoods: [],
  filteredFoods: [],
  activeCategory: null,
  searchTerm: '',
  selectedIds: [],
  sortKey: 'name',
  sortDirection: 'asc',
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

const getSortValue = (food, key) => {
  switch (key) {
    case 'calories':
      return Number(food.calories) || 0;
    case 'protein':
      return Number(food.protein_g) || 0;
    case 'fat':
      return Number(food.fat_g) || 0;
    case 'carbs':
      return Number(food.carbs_g) || 0;
    case 'fiber':
      return Number(food.fiber_g) || 0;
    case 'netcarb':
      return (Number(food.carbs_g) || 0) - (Number(food.fiber_g) || 0);
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
    if (id === state.activeCategory || (!id && !state.activeCategory)) {
      button.classList.add('active');
    }
    button.textContent = label;
    button.addEventListener('click', () => handleCategorySelection(id));
    container.appendChild(button);
  };

  renderButton('All foods', null);

  state.categories.forEach((cat) => {
    renderButton(`${cat.label} (${cat.count})`, cat.id);
  });
};

const handleCategorySelection = (categoryId) => {
  state.activeCategory = categoryId;
  applyFilters();
  renderCategories();
};

const applyFilters = () => {
  let foods = [...state.allFoods];
  const term = state.searchTerm.trim().toLowerCase();

  if (state.activeCategory) {
    foods = foods.filter((food) => food.categoryId === state.activeCategory);
  }

  if (term) {
    foods = foods.filter(
      (food) =>
        food.name.toLowerCase().includes(term) ||
        food.categoryLabel.toLowerCase().includes(term)
    );
  }

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
    <td>${formatNumber(food.calories)} kcal</td>
    <td>${formatNumber(food.protein_g)} g</td>
    <td>${formatNumber(food.fat_g)} g</td>
    <td>${formatNumber(food.carbs_g)} g</td>
    <td>${formatNumber(food.fiber_g)} g</td>
    <td>${formatNumber((food.carbs_g || 0) - (food.fiber_g || 0))} g</td>
    <td>${formatMicronutrients(food.vitamins)}</td>
    <td>${formatMicronutrients(food.minerals)}</td>
    <td class="action-cell"></td>
  `;
  row.querySelector('.action-cell').appendChild(button);
  return row;
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
        ${sortableHeader('calories', 'Calories')}
        ${sortableHeader('protein', 'Protein')}
        ${sortableHeader('fat', 'Fat')}
        ${sortableHeader('carbs', 'Carbs')}
        ${sortableHeader('fiber', 'Fiber')}
        ${sortableHeader('netcarb', 'Net carbs')}
        <th>Vitamins</th>
        <th>Minerals</th>
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
    state.activeCategory = null;
    state.searchTerm = '';
    state.sortKey = 'name';
    state.sortDirection = 'asc';
    elements.searchInput.value = '';
    renderCategories();
    applyFilters();
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

    renderCategories();
    renderSelectionSummary();
    renderFoodTable();
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
