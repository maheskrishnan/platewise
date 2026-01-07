const SUMMARY_FIELDS = [
  { key: 'calories', label: 'Calories', suffix: 'kcal' },
  { key: 'protein_g', label: 'Protein', suffix: 'g' },
  {
    key: 'carbs_g',
    label: 'Carbs',
    suffix: 'g',
    sublines: [
      { key: 'netCarb', label: 'Net carb', suffix: 'g' },
      { key: 'fiber_g', label: 'Fiber', suffix: 'g', dv: 28 },
    ],
  },
  {
    key: 'fat_g',
    label: 'Total fat',
    suffix: 'g',
    sublines: [
      { key: 'saturated_g', label: 'Sat', suffix: 'g' },
      { key: 'monounsaturated_g', label: 'Mono', suffix: 'g' },
      { key: 'polyunsaturated_g', label: 'Poly', suffix: 'g' },
    ],
  },
  { key: 'cholesterol_mg', label: 'Cholesterol', suffix: 'mg', dv: 300 },
  { key: 'sodium_mg', label: 'Sodium', suffix: 'mg', dv: 2300 },
  { key: 'sugar_g', label: 'Sugar', suffix: 'g' },
];

const BASE_UNIT_OPTIONS = [
  { label: 'g', grams: 1 },
  { label: 'oz', grams: 28.3495 },
  { label: 'lb', grams: 453.592 },
];

const BASE_UNIT_MAP = BASE_UNIT_OPTIONS.reduce((acc, option) => {
  acc[option.label] = option;
  return acc;
}, {});

const DEFAULT_UNIT = 'g';
const DEFAULT_QUANTITY = 100;

const createTotalsSnapshot = () => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  netCarb: 0,
  fat_g: 0,
  fiber_g: 0,
  cholesterol_mg: 0,
  sodium_mg: 0,
  saturated_g: 0,
  monounsaturated_g: 0,
  polyunsaturated_g: 0,
  sugar_g: 0,
});

const makeRecipeId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `recipe-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const normalizeRecipe = (recipe) => ({
  id: recipe.id || makeRecipeId(),
  title: recipe.title || 'New recipe',
  description: typeof recipe.description === 'string' ? recipe.description : '',
  collapsed: Boolean(recipe.collapsed),
  ingredients: Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((entry) => ({
        ...entry,
        quantity: sanitizeQuantity(entry.quantity ?? DEFAULT_QUANTITY),
        unit: entry.unit || DEFAULT_UNIT,
        unitGrams:
          Number(entry.unitGrams) && entry.unitGrams > 0
            ? Number(entry.unitGrams)
            : getUnitBase(entry.unit || DEFAULT_UNIT),
      }))
    : [],
});

const state = {
  foods: [],
  foodMap: new Map(),
  recipes: [],
  recipeSearch: '',
  recipeOrder: 'default',
  searchTerms: {},
  searchHighlights: {},
  searchResults: {},
};

const elements = {
  recipeList: document.getElementById('recipeLibraryList'),
  addRecipeButton: document.getElementById('addLibraryRecipe'),
  searchInput: document.getElementById('recipeLibrarySearch'),
  orderSelect: document.getElementById('recipeOrderSelect'),
  compareNavBadge: document.getElementById('compareNavBadge'),
};

let videoModalElement = null;
let videoModalKeyHandler = null;

const fetchJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
};

const formatNumber = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 100) return Math.round(number);
  return Math.round(number * 100) / 100;
};

const sanitizeQuantity = (value) => {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_QUANTITY;
  }
  const trimmed = String(value).trim();
  if (trimmed === '.' || trimmed === '-'
  ) {
    return DEFAULT_QUANTITY;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUANTITY;
  }
  return Math.min(Math.round(parsed * 100) / 100, 9999);
};

const clampGrams = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUANTITY;
  }
  return Math.min(Math.round(parsed * 10) / 10, 10000);
};

const getUnitBase = (unit) =>
  BASE_UNIT_MAP[unit]?.grams || BASE_UNIT_MAP[DEFAULT_UNIT].grams;

const getEntryGrams = (entry) => {
  const quantity = sanitizeQuantity(entry.quantity ?? DEFAULT_QUANTITY);
  const gramsPerUnit = Number(entry.unitGrams);
  const base =
    Number.isFinite(gramsPerUnit) && gramsPerUnit > 0
      ? gramsPerUnit
      : getUnitBase(entry.unit ?? DEFAULT_UNIT);
  return clampGrams(quantity * base);
};

const getSuggestedUnits = (food) => {
  if (!food || !Array.isArray(food.suggested_units)) return [];
  return food.suggested_units
    .filter(
      (entry) =>
        entry &&
        typeof entry.unit === 'string' &&
        entry.unit.trim().length &&
        Number(entry.grams) > 0
    )
    .map((entry) => ({
      key: entry.unit,
      label: entry.unit,
      grams: Number(entry.grams),
    }));
};

const getUnitOptionsForFood = (food) => {
  const suggestions = getSuggestedUnits(food);
  if (suggestions.length) return suggestions;
  return BASE_UNIT_OPTIONS.map((unit) => ({
    key: unit.label,
    label: unit.label,
    grams: unit.grams,
  }));
};

const getDefaultServingForFood = (food) => {
  const suggestions = getSuggestedUnits(food);
  if (suggestions.length) {
    return {
      quantity: 1,
      unit: suggestions[0].label,
      unitGrams: suggestions[0].grams,
    };
  }
  const base = getUnitBase(DEFAULT_UNIT);
  return {
    quantity: DEFAULT_QUANTITY,
    unit: DEFAULT_UNIT,
    unitGrams: base,
  };
};

const loadRecipes = async () => {
  try {
    const response = await fetch('/api/recipes');
    if (!response.ok) throw new Error('Failed to load recipes');
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map(normalizeRecipe);
  } catch (error) {
    console.error(error);
    return [];
  }
};

const persistRecipes = async () => {
  try {
    await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipes: state.recipes }),
    });
  } catch (error) {
    console.error('Failed to save recipes', error);
  }
};

const ensureSearchTerm = (recipeId) => {
  if (typeof state.searchTerms[recipeId] !== 'string') {
    state.searchTerms[recipeId] = '';
  }
  if (typeof state.searchHighlights[recipeId] !== 'number') {
    state.searchHighlights[recipeId] = -1;
  }
  if (!Array.isArray(state.searchResults[recipeId])) {
    state.searchResults[recipeId] = [];
  }
};

const getRecipeById = (recipeId) =>
  state.recipes.find((recipe) => recipe.id === recipeId);

const getRecipeTotals = (recipe) => {
  const totals = createTotalsSnapshot();
  recipe.ingredients.forEach((entry) => {
    const food = state.foodMap.get(entry.id);
    if (!food) return;
    const grams = getEntryGrams(entry);
    const factor = grams / 100;
    totals.calories += (food.calories || 0) * factor;
    totals.protein_g += (food.protein_g || 0) * factor;
    totals.carbs_g += (food.carbs_g || 0) * factor;
    totals.fat_g += (food.fat_g || 0) * factor;
    totals.fiber_g += (food.fiber_g || 0) * factor;
    totals.cholesterol_mg += (food.cholesterol_mg || 0) * factor;
    totals.sodium_mg += (food.sodium_mg || 0) * factor;
    totals.saturated_g += (food.saturated_g || 0) * factor;
    totals.monounsaturated_g += (food.monounsaturated_g || 0) * factor;
    totals.polyunsaturated_g += (food.polyunsaturated_g || 0) * factor;
    totals.sugar_g += (food.sugar_g || 0) * factor;
  });
  totals.netCarb = totals.carbs_g - totals.fiber_g;
  return totals;
};

const getRecipeCollapsedSummary = (totals) => {
  const metrics = [
    `${formatNumber(totals.calories)} kcal`,
    `${formatNumber(totals.protein_g)} g protein`,
    `${formatNumber(totals.carbs_g)} g carbs`,
    `${formatNumber(totals.fat_g)} g fat`,
    `${formatNumber(totals.fiber_g)} g fiber`,
  ];
  return metrics.join(' • ');
};

const escapeHtml = (text) =>
  (text || '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char];
  });

const extractYouTubeId = (text = '') => {
  if (typeof text !== 'string') return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{6,})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:[^\s]*&)?v=([a-zA-Z0-9_-]{6,})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

const closeVideoModal = () => {
  if (videoModalElement) {
    videoModalElement.remove();
    videoModalElement = null;
  }
  if (videoModalKeyHandler) {
    document.removeEventListener('keydown', videoModalKeyHandler);
    videoModalKeyHandler = null;
  }
};

const openVideoModal = (videoId, title) => {
  if (!videoId) return;
  closeVideoModal();
  const safeTitle = escapeHtml(title || 'Recipe video');
  const iframeSrc = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
  const modal = document.createElement('div');
  modal.className = 'video-modal';
  modal.innerHTML = `
    <div class="video-modal__panel" role="dialog" aria-modal="true" aria-label="Recipe video">
      <div class="video-modal__header">
        <h3>${safeTitle}</h3>
        <button type="button" class="close-btn" data-close-video aria-label="Close video">&times;</button>
      </div>
      <div class="video-embed">
        <iframe src="${iframeSrc}" title="${safeTitle}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  videoModalElement = modal;
  videoModalKeyHandler = (event) => {
    if (event.key === 'Escape') {
      closeVideoModal();
    }
  };
  document.addEventListener('keydown', videoModalKeyHandler);
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-close-video]')) {
      closeVideoModal();
    }
  });
};

const renderRecipeCard = (recipe, index) => {
  const totals = getRecipeTotals(recipe);
  const quantityRows = recipe.ingredients
      .map((entry, index) => {
        const food = state.foodMap.get(entry.id);
        if (!food) return '';
      const quantity = sanitizeQuantity(entry.quantity ?? DEFAULT_QUANTITY);
      const grams = getEntryGrams(entry);
      const unitOptions = getUnitOptionsForFood(food);
        return `
          <tr draggable="true" data-ingredient-row="${recipe.id}" data-food-id="${entry.id}" data-index="${index}">
          <td>
            <div class="food-meta">
              <span class="food-name">${food.name}</span>
              <span class="food-category">${food.categoryLabel}</span>
            </div>
          </td>
          <td>
            <div class="qty-unit-control">
              <input type="text" inputmode="decimal" value="${quantity}" class="meal-qty-input" data-quantity-input="${recipe.id}" data-food-id="${entry.id}">
              <select data-unit-select="${recipe.id}" data-food-id="${entry.id}">
                ${unitOptions
                  .map(
                    (option) =>
                      `<option value="${option.key}" ${
                        option.key === entry.unit ? 'selected' : ''
                      } data-grams="${option.grams}">${option.label}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </td>
          <td>${formatNumber(grams)} g</td>
          <td>${formatNumber((food.calories || 0) * (grams / 100))} kcal</td>
          <td>${formatNumber((food.protein_g || 0) * (grams / 100))} g</td>
          <td>${formatNumber((food.carbs_g || 0) * (grams / 100))} g</td>
          <td>${formatNumber(((food.carbs_g || 0) - (food.fiber_g || 0)) * (grams / 100))} g</td>
          <td>${formatNumber((food.fat_g || 0) * (grams / 100))} g</td>
          <td>${formatNumber((food.fiber_g || 0) * (grams / 100))} g</td>
          <td class="action-cell">
            <button type="button" class="text-link" data-remove-ingredient="${recipe.id}" data-food-id="${entry.id}">Remove</button>
          </td>
        </tr>
      `;
    })
    .join('');

  const totalsRow = `
    <tr class="recipe-totals-row">
      <td>Totals</td>
      <td></td>
      <td></td>
      <td>${formatNumber(totals.calories)} kcal</td>
      <td>${formatNumber(totals.protein_g)} g</td>
      <td>${formatNumber(totals.carbs_g)} g</td>
      <td>${formatNumber(totals.netCarb)} g</td>
      <td>${formatNumber(totals.fat_g)} g</td>
      <td>${formatNumber(totals.fiber_g)} g</td>
      <td></td>
    </tr>
  `;

  const searchValue = state.searchTerms[recipe.id] || '';
  const videoId = extractYouTubeId(recipe.description || '');

  return `
    <section class="recipe-card ${recipe.collapsed ? 'collapsed' : ''}" data-recipe-id="${recipe.id}" draggable="false" data-index="${index}">
      <div class="recipe-card__header">
        <button type="button" class="icon-btn" aria-label="${
          recipe.collapsed ? 'Expand recipe' : 'Collapse recipe'
        }" data-toggle-recipe="${recipe.id}">
          ${recipe.collapsed ? '▸' : '▾'}
        </button>
        <div class="recipe-title-wrapper" data-recipe-title-wrapper="${recipe.id}">
          <button type="button" class="recipe-title-display" data-edit-title="${recipe.id}">
            ${escapeHtml(recipe.title)}
          </button>
          <input type="text" class="recipe-title-input" data-recipe-title-input="${recipe.id}" value="${escapeHtml(
            recipe.title
          )}">
        </div>
        ${
          recipe.collapsed
            ? `<div class="recipe-collapsed-summary">${getRecipeCollapsedSummary(
                totals
              )}</div>`
            : ''
        }
        <div class="recipe-card__actions">
          ${
            videoId
              ? `<button type="button" class="icon-btn youtube-btn" aria-label="Watch video for ${escapeHtml(
                  recipe.title
                )}" data-view-video="${recipe.id}" data-video-id="${videoId}" data-video-title="${escapeHtml(
                  recipe.title
                )}" title="Play linked video">▶</button>`
              : ''
          }
          <button type="button" class="ghost-btn secondary" data-edit-notes="${recipe.id}">Notes</button>
          <button type="button" class="ghost-btn" data-clone-recipe="${recipe.id}">Clone</button>
          <button type="button" class="ghost-btn danger" data-remove-recipe="${recipe.id}">Delete</button>
        </div>
      </div>
      <div class="recipe-card__body">
        <label class="recipe-search-row" for="recipeSearch-${recipe.id}">
          <span class="search-label__title">Add ingredients</span>
          <input type="search" id="recipeSearch-${recipe.id}" placeholder="Search foods..." autocomplete="off" data-recipe-search="${recipe.id}" value="${escapeHtml(
            searchValue
          )}">
        </label>
        <div class="search-results" data-recipe-results="${recipe.id}"></div>
        <div class="meal-table-wrapper">
        <table class="meal-table" data-recipe-table="${recipe.id}">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Qty / Unit</th>
                <th>Grams</th>
                <th>Calories</th>
                <th>Protein</th>
                <th>Carbs</th>
                <th>Net carb</th>
                <th>Total fat</th>
                <th>Fiber</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                recipe.ingredients.length
                  ? `${quantityRows}${totalsRow}`
                  : `<tr><td colspan="10" class="meal-empty">No ingredients yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
};

const renderRecipeSearchResults = (recipeId) => {
  const container = document.querySelector(
    `[data-recipe-results="${recipeId}"]`
  );
  if (!container) return;
  const term = (state.searchTerms[recipeId] || '').trim().toLowerCase();
  if (!term) {
    container.innerHTML = '';
    return;
  }
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const existingIds = new Set(recipe.ingredients.map((item) => item.id));
  const matches = state.foods
    .filter((food) => food.name.toLowerCase().includes(term))
    .slice(0, 5)
    .map((food) => ({
      food,
      disabled: existingIds.has(food.id),
    }));
  state.searchResults[recipeId] = matches;
  if (!matches.length) {
    container.innerHTML = '<p class="helper-text">No foods found.</p>';
    state.searchHighlights[recipeId] = -1;
    return;
  }
  container.innerHTML = matches
    .map(
      ({ food, disabled }, index) => `
      <div class="search-result ${disabled ? 'disabled' : ''}" data-search-index="${index}">
        <div class="info">
          <span class="name">${food.name}</span>
          <span class="category">${formatNumber(food.calories)} kcal • ${formatNumber(
        food.protein_g
      )} g protein</span>
        </div>
        <button type="button" class="compare-btn" data-add-ingredient="${recipeId}" data-food-id="${food.id}" ${disabled ? 'disabled' : ''}>
          ${disabled ? 'Added' : 'Add'}
        </button>
      </div>
    `
    )
    .join('');
  updateSearchHighlight(recipeId);
};

const getRecipeDensityScore = (recipe, key) => {
  const totals = getRecipeTotals(recipe);
  const calories = totals.calories || 0;
  if (!calories) return 0;
  if (key === 'protein') return totals.protein_g / calories;
  if (key === 'fiber') return totals.fiber_g / calories;
  if (key === 'fat') return totals.fat_g / calories;
  if (key === 'carb') {
    const netCarb = totals.netCarb || totals.carbs_g - totals.fiber_g;
    return netCarb / calories;
  }
  return 0;
};

const renderRecipes = () => {
  if (!elements.recipeList) return;
  const term = state.recipeSearch.trim().toLowerCase();
  let filtered = state.recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(term) ||
    recipe.ingredients.some((ingredient) => {
      const food = state.foodMap.get(ingredient.id);
      return food
        ? food.name.toLowerCase().includes(term)
        : false;
    })
  );
  if (!filtered.length) {
    elements.recipeList.innerHTML =
      '<p class="empty-state">No recipes yet. Add your first recipe to get started.</p>';
    return;
  }
  const { recipeOrder } = state;
  if (recipeOrder !== 'default') {
    const factor = recipeOrder === 'carb' ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      const aScore = getRecipeDensityScore(a, recipeOrder);
      const bScore = getRecipeDensityScore(b, recipeOrder);
      return (bScore - aScore) * factor;
    });
  }
  elements.recipeList.innerHTML = filtered
    .map((recipe, index) => renderRecipeCard(recipe, index))
    .join('');
  filtered.forEach((recipe) => renderRecipeSearchResults(recipe.id));
};

const addRecipe = () => {
  const recipe = {
    id: makeRecipeId(),
    title: 'New recipe',
    description: '',
    ingredients: [],
    collapsed: false,
  };
  state.recipes.unshift(recipe);
  ensureSearchTerm(recipe.id);
  persistRecipes();
  renderRecipes();
};

const removeRecipe = (recipeId) => {
  state.recipes = state.recipes.filter((recipe) => recipe.id !== recipeId);
  delete state.searchTerms[recipeId];
  persistRecipes();
  renderRecipes();
};

const cloneRecipe = (recipeId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const clone = normalizeRecipe({
    ...recipe,
    id: undefined,
    title: `${recipe.title} (copy)`,
    collapsed: false,
  });
  state.recipes.unshift(clone);
  ensureSearchTerm(clone.id);
  persistRecipes();
  renderRecipes();
};

const toggleRecipeCollapse = (recipeId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.collapsed = !recipe.collapsed;
  persistRecipes();
  renderRecipes();
};

const updateRecipeTitle = (recipeId, title) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.title = title || 'New recipe';
  persistRecipes();
};

const updateRecipeDescription = (recipeId, description) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.description = description;
  persistRecipes();
};

const addIngredientToRecipe = (recipeId, foodId) => {
  const recipe = getRecipeById(recipeId);
  const food = state.foodMap.get(foodId);
  if (!recipe || !food) return;
  if (recipe.ingredients.some((item) => item.id === foodId)) return;
  const serving = getDefaultServingForFood(food);
  recipe.ingredients.push({
    id: foodId,
    quantity: serving.quantity,
    unit: serving.unit,
    unitGrams: serving.unitGrams,
  });
  state.searchTerms[recipeId] = '';
  state.searchHighlights[recipeId] = -1;
  state.searchResults[recipeId] = [];
  persistRecipes();
  renderRecipes();
  focusRecipeSearch(recipeId);
};

const removeIngredientFromRecipe = (recipeId, foodId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.ingredients = recipe.ingredients.filter((item) => item.id !== foodId);
  persistRecipes();
  renderRecipes();
};

const handleQuantityChange = (recipeId, foodId, value) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const entry = recipe.ingredients.find((item) => item.id === foodId);
  if (!entry) return;
  entry.quantity = sanitizeQuantity(value);
  persistRecipes();
  renderRecipes();
};

const handleUnitChange = (recipeId, foodId, unit, gramsPerUnit) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const entry = recipe.ingredients.find((item) => item.id === foodId);
  if (!entry) return;
  entry.unit = unit || DEFAULT_UNIT;
  entry.unitGrams =
    Number.isFinite(gramsPerUnit) && gramsPerUnit > 0
      ? gramsPerUnit
      : getUnitBase(entry.unit);
  persistRecipes();
  renderRecipes();
};

const openNotesModal = (recipeId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const modal = document.createElement('div');
  modal.className = 'notes-modal';
  modal.innerHTML = `
    <div class="notes-modal__panel">
      <div class="notes-modal__header">
        <div>
          <h3>${escapeHtml(recipe.title)}</h3>
        </div>
        <button type="button" class="close-btn" data-close-notes>&times;</button>
      </div>
      <textarea data-notes-input rows="4">${escapeHtml(recipe.description || '')}</textarea>
      <div class="notes-modal__actions">
        <button type="button" class="ghost-btn" data-close-notes>Cancel</button>
        <button type="button" class="primary-link" data-save-notes="${recipeId}">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => modal.remove();

  modal.addEventListener('click', (event) => {
    if (
      event.target.matches('[data-close-notes]') ||
      event.target === modal
    ) {
      closeModal();
    }
    if (event.target.matches('[data-save-notes]')) {
      const textarea = modal.querySelector('[data-notes-input]');
      updateRecipeDescription(recipeId, textarea.value);
      closeModal();
      renderRecipes();
    }
  });
};

const toggleTitleEditing = (recipeId, force) => {
  const wrapper = document.querySelector(
    `[data-recipe-title-wrapper="${recipeId}"]`
  );
  if (!wrapper) return;
  const card = wrapper.closest('.recipe-card');
  if (card?.classList.contains('collapsed')) return;
  const displayButton = wrapper.querySelector('[data-edit-title]');
  const input = wrapper.querySelector('[data-recipe-title-input]');
  if (force) {
    document
      .querySelectorAll('.recipe-title-wrapper.editing')
      .forEach((el) => el.classList.remove('editing'));
    wrapper.classList.add('editing');
    if (input) {
      input.focus();
      input.select();
      const handleBlur = () => {
        const value = input.value.trim();
        if (value) {
          updateRecipeTitle(recipeId, value);
        }
        toggleTitleEditing(recipeId, false);
        input.removeEventListener('blur', handleBlur);
      };
      input.addEventListener('blur', handleBlur);
    }
  } else {
    if (input && displayButton) {
      const nextValue = input.value.trim() || 'New recipe';
      displayButton.textContent = nextValue;
    }
    wrapper.classList.remove('editing');
  }
};

const updateSearchHighlight = (recipeId) => {
  const container = document.querySelector(
    `[data-recipe-results="${recipeId}"]`
  );
  if (!container) return;
  const rows = container.querySelectorAll('.search-result');
  const activeIndex = state.searchHighlights[recipeId] ?? -1;
  rows.forEach((row, index) => {
    row.classList.toggle('active', index === activeIndex);
  });
};

const focusRecipeSearch = (recipeId) => {
  requestAnimationFrame(() => {
    const input = document.querySelector(
      `[data-recipe-search="${recipeId}"]`
    );
    if (input) {
      input.focus();
      input.select();
    }
  });
};

const handleSearchKeyDown = (event) => {
  const input = event.target;
  const recipeId = input.dataset.recipeSearch;
  const results = state.searchResults[recipeId] || [];
  const maxIndex = results.length - 1;
  if (!results.length) return;
  let index = state.searchHighlights[recipeId] ?? -1;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    index = Math.min(index + 1, maxIndex);
    state.searchHighlights[recipeId] = index;
    updateSearchHighlight(recipeId);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    index = Math.max(index - 1, -1);
    state.searchHighlights[recipeId] = index;
    updateSearchHighlight(recipeId);
    return;
  }
  if (event.key === 'Enter' && index >= 0) {
    event.preventDefault();
    const result = results[index];
    if (result && !result.disabled) {
      addIngredientToRecipe(recipeId, result.food.id);
      state.searchHighlights[recipeId] = -1;
      updateSearchHighlight(recipeId);
    }
  }
  if (event.key === 'Escape') {
    state.searchHighlights[recipeId] = -1;
    updateSearchHighlight(recipeId);
  }
};

const updateCompareNavBadge = () => {
  if (!elements.compareNavBadge) return;
  try {
    const stored = localStorage.getItem('foodSelections');
    if (!stored) {
      elements.compareNavBadge.classList.add('hidden');
      return;
    }
    const parsed = JSON.parse(stored);
    const count = Array.isArray(parsed) ? parsed.length : 0;
    elements.compareNavBadge.textContent = count;
    elements.compareNavBadge.classList.toggle('hidden', count === 0);
  } catch {
    elements.compareNavBadge.classList.add('hidden');
  }
};

const attachEvents = () => {
  elements.addRecipeButton?.addEventListener('click', addRecipe);
  elements.searchInput?.addEventListener('input', (event) => {
    state.recipeSearch = event.target.value;
    renderRecipes();
  });
  elements.orderSelect?.addEventListener('change', (event) => {
    state.recipeOrder = event.target.value;
    renderRecipes();
  });

  elements.recipeList?.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-recipe-title-input]')) {
      const { recipeTitleInput } = target.dataset;
      updateRecipeTitle(recipeTitleInput, target.value.trim());
      return;
    }
    if (target.matches('[data-recipe-description]')) {
      updateRecipeDescription(target.dataset.recipeDescription, target.value);
      return;
    }
    if (target.matches('[data-recipe-search]')) {
      const recipeId = target.dataset.recipeSearch;
      state.searchTerms[recipeId] = target.value;
      state.searchHighlights[recipeId] = -1;
      renderRecipeSearchResults(recipeId);
      return;
    }
  });

  elements.recipeList?.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('.meal-qty-input')) {
      const recipeId = target.dataset.quantityInput;
      const foodId = target.dataset.foodId;
      handleQuantityChange(recipeId, foodId, target.value);
      return;
    }
    if (target.matches('[data-unit-select]')) {
      const recipeId = target.dataset.unitSelect;
      const foodId = target.dataset.foodId;
      const grams =
        target.selectedOptions[0] && target.selectedOptions[0].dataset.grams
          ? Number(target.selectedOptions[0].dataset.grams)
          : undefined;
      handleUnitChange(recipeId, foodId, target.value, grams);
    }
  });

  elements.recipeList?.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      target.matches('[data-recipe-title-input]') &&
      event.key === 'Enter'
    ) {
      event.preventDefault();
      const { recipeTitleInput } = target.dataset;
      updateRecipeTitle(recipeTitleInput, target.value.trim());
      toggleTitleEditing(recipeTitleInput, false);
    }
    if (target.matches('[data-recipe-search]')) {
      handleSearchKeyDown(event);
    }
  });

  elements.recipeList?.addEventListener('mousedown', (event) => {
    const addBtn = event.target.closest('[data-add-ingredient]');
    if (addBtn) {
      event.preventDefault();
      addIngredientToRecipe(addBtn.dataset.addIngredient, addBtn.dataset.foodId);
    }
  }, true);

  elements.recipeList?.addEventListener('click', (event) => {
    const addBtn = event.target.closest('[data-add-ingredient]');
    if (addBtn) {
      return;
    }
    const videoBtn = event.target.closest('[data-view-video]');
    if (videoBtn) {
      openVideoModal(videoBtn.dataset.videoId, videoBtn.dataset.videoTitle);
      return;
    }
    const toggleBtn = event.target.closest('[data-toggle-recipe]');
    if (toggleBtn) {
      toggleRecipeCollapse(toggleBtn.dataset.toggleRecipe);
      return;
    }
    const titleBtn = event.target.closest('[data-edit-title]');
    if (titleBtn) {
      toggleTitleEditing(titleBtn.dataset.editTitle, true);
      return;
    }
    const notesBtn = event.target.closest('[data-edit-notes]');
    if (notesBtn) {
      openNotesModal(notesBtn.dataset.editNotes);
      return;
    }
    const removeBtn = event.target.closest('[data-remove-ingredient]');
    if (removeBtn) {
      removeIngredientFromRecipe(
        removeBtn.dataset.removeIngredient,
        removeBtn.dataset.foodId
      );
      return;
    }
    const removeRecipeBtn = event.target.closest('[data-remove-recipe]');
    if (removeRecipeBtn) {
      removeRecipe(removeRecipeBtn.dataset.removeRecipe);
      return;
    }
    const cloneBtn = event.target.closest('[data-clone-recipe]');
    if (cloneBtn) {
      cloneRecipe(cloneBtn.dataset.cloneRecipe);
      return;
    }
  });

  let ingredientDragState = {
    recipeId: null,
    sourceIndex: -1,
    indicator: null,
  };

  const clearIngredientIndicator = () => {
    if (ingredientDragState.indicator && ingredientDragState.indicator.parentNode) {
      ingredientDragState.indicator.parentNode.removeChild(ingredientDragState.indicator);
    }
    ingredientDragState.indicator = null;
  };

  elements.recipeList?.addEventListener('dragstart', (event) => {
    const row = event.target.closest('[data-ingredient-row]');
    if (!row) return;
    ingredientDragState.recipeId = row.dataset.ingredientRow;
    ingredientDragState.sourceIndex = Number(row.dataset.index);
    row.classList.add('dragging');
    if (!ingredientDragState.indicator) {
      ingredientDragState.indicator = document.createElement('tr');
      ingredientDragState.indicator.className = 'drop-indicator';
      ingredientDragState.indicator.innerHTML = '<td colspan="10"></td>';
    }
    event.dataTransfer.effectAllowed = 'move';
  });

  elements.recipeList?.addEventListener('dragend', (event) => {
    const row = event.target.closest('[data-ingredient-row]');
    if (row) {
      row.classList.remove('dragging');
    }
    ingredientDragState.recipeId = null;
    ingredientDragState.sourceIndex = -1;
    clearIngredientIndicator();
  });

  elements.recipeList?.addEventListener('dragover', (event) => {
    if (!ingredientDragState.recipeId) return;
    const table = event.target.closest(
      `table[data-recipe-table="${ingredientDragState.recipeId}"]`
    );
    if (!table) return;
    event.preventDefault();
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const targetRow = event.target.closest('[data-ingredient-row]');
    if (!targetRow || targetRow.dataset.ingredientRow !== ingredientDragState.recipeId) {
      if (!ingredientDragState.indicator.parentNode) {
        tbody.appendChild(ingredientDragState.indicator);
      }
      return;
    }
    const rect = targetRow.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    if (before) {
      targetRow.parentNode.insertBefore(ingredientDragState.indicator, targetRow);
    } else {
      targetRow.parentNode.insertBefore(
        ingredientDragState.indicator,
        targetRow.nextSibling
      );
    }
  });

  elements.recipeList?.addEventListener('drop', (event) => {
    if (!ingredientDragState.recipeId || ingredientDragState.sourceIndex < 0) return;
    const table = event.target.closest(
      `table[data-recipe-table="${ingredientDragState.recipeId}"]`
    );
    if (!table) return;
    event.preventDefault();
    const tbody = table.querySelector('tbody');
    if (!tbody || !ingredientDragState.indicator || !ingredientDragState.indicator.parentNode) {
      clearIngredientIndicator();
      return;
    }
    const children = Array.from(tbody.children);
    if (!children.includes(ingredientDragState.indicator)) {
      clearIngredientIndicator();
      return;
    }
    let targetIndex = 0;
    for (const child of children) {
      if (child === ingredientDragState.indicator) break;
      if (child.matches('[data-ingredient-row]')) {
        targetIndex += 1;
      }
    }
    const recipe = getRecipeById(ingredientDragState.recipeId);
    if (!recipe) {
      clearIngredientIndicator();
      return;
    }
    const fromIndex = ingredientDragState.sourceIndex;
    if (fromIndex < 0 || fromIndex >= recipe.ingredients.length) {
      clearIngredientIndicator();
      return;
    }
    const [moved] = recipe.ingredients.splice(fromIndex, 1);
    const adjustedIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    const boundedIndex = Math.max(0, Math.min(adjustedIndex, recipe.ingredients.length));
    if (boundedIndex === fromIndex) {
      clearIngredientIndicator();
      return;
    }
    recipe.ingredients.splice(boundedIndex, 0, moved);
    persistRecipes();
    renderRecipes();
    clearIngredientIndicator();
    ingredientDragState.recipeId = null;
    ingredientDragState.sourceIndex = -1;
  });
};

const bootstrap = async () => {
  try {
    const [foods, recipes] = await Promise.all([
      fetchJson('/api/foods'),
      loadRecipes(),
    ]);
    state.foods = foods;
    state.foodMap.clear();
    foods.forEach((food) => state.foodMap.set(food.id, food));
    state.recipes = recipes;
    state.recipes.forEach((recipe) => ensureSearchTerm(recipe.id));
    renderRecipes();
    attachEvents();
    updateCompareNavBadge();
    window.addEventListener('storage', (event) => {
      if (event.key === 'foodSelections') {
        updateCompareNavBadge();
      }
    });
  } catch (error) {
    console.error(error);
    if (elements.recipeList) {
      elements.recipeList.innerHTML =
        '<p class="empty-state">Unable to load recipes. Please refresh.</p>';
    }
  }
};

bootstrap();
