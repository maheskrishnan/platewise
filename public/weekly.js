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

const state = {
  foods: [],
  foodMap: new Map(),
  recipes: [],
  searchTerms: {},
};

const elements = {
  recipeList: document.getElementById('recipeList'),
  dailyAverages: document.getElementById('dailyAverages'),
  addRecipeButton: document.getElementById('addRecipeButton'),
  compareNavBadge: document.getElementById('compareNavBadge'),
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
    return '—';
  }
  if (Math.abs(number) >= 100) {
    return Math.round(number);
  }
  return Math.round(number * 100) / 100;
};

const sanitizeQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUANTITY;
  }
  return Math.min(Math.round(parsed * 100) / 100, 9999);
};

const getUnitBase = (unit) =>
  BASE_UNIT_MAP[unit]?.grams || BASE_UNIT_MAP[DEFAULT_UNIT].grams;

const clampGrams = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUANTITY;
  }
  return Math.min(Math.round(parsed * 10) / 10, 10000);
};

const getEntryGrams = (entry) => {
  const quantity = sanitizeQuantity(entry.quantity ?? DEFAULT_QUANTITY);
  const base =
    Number(entry.unitGrams) && entry.unitGrams > 0
      ? Number(entry.unitGrams)
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

const createRecipe = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `recipe-${Date.now()}`,
  title: 'New recipe',
  description: '',
  ingredients: [],
  collapsed: false,
});

const loadRecipes = async () => {
  try {
    const response = await fetch('/api/weekly-plans');
    if (!response.ok) throw new Error('Failed to load weekly plans');
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return [createRecipe()];
    return data.map((recipe) => ({
      ...recipe,
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
    }));
  } catch (error) {
    console.error(error);
    return [createRecipe()];
  }
};

const persistRecipes = async () => {
  try {
    await fetch('/api/weekly-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipes: state.recipes }),
    });
  } catch (error) {
    console.error('Failed to save weekly recipes', error);
  }
};

const getRecipeById = (recipeId) =>
  state.recipes.find((recipe) => recipe.id === recipeId);

const getRecipeTotals = (recipe) => {
  const totals = {
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
  };
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
  });
  totals.netCarb = totals.carbs_g - totals.fiber_g;
  return totals;
};

const formatSummaryValue = (field, totals) => {
  const value = totals[field.key] ?? 0;
  const suffix = field.suffix ? ` ${field.suffix}` : '';
  return `${formatNumber(value)}${suffix}`;
};

const formatDailyValuePercent = (field, totals) => {
  if (!field.dv) return '';
  const value = totals[field.key];
  if (value === undefined || value === null) return '';
  if (!Number.isFinite(value)) return '';
  const percent = Math.round((value / field.dv) * 100);
  if (!Number.isFinite(percent)) return '';
  return `${percent}% RDV`;
};

const renderSummaryGrid = (container, totals) => {
  if (!container) return;
  container.innerHTML = SUMMARY_FIELDS.map((field) => {
    const dvText = formatDailyValuePercent(field, totals);
    const sublines = field.sublines
      ? field.sublines
          .map(
            (sub) =>
              `<span>${sub.label}: ${formatSummaryValue(sub, totals)}</span>`
          )
          .join('')
      : '';
    return `
      <div class="daily-total">
        <p class="label">${field.label}</p>
        <p class="value">${formatSummaryValue(field, totals)}</p>
        ${dvText ? `<p class="dv">${dvText}</p>` : ''}
        ${
          field.sublines
            ? `<div class="daily-total__subs">
                ${field.sublines
                  .map((sub) => {
                    const subDv = formatDailyValuePercent(sub, totals);
                    return `<span>${sub.label}: ${formatSummaryValue(
                      sub,
                      totals
                    )}${subDv ? ` (${subDv})` : ''}</span>`;
                  })
                  .join('')}
              </div>`
            : ''
        }
      </div>
    `;
  }).join('');
};

const renderSummaries = () => {
  const weeklyTotals = {
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
  };
  state.recipes.forEach((recipe) => {
    const recipeTotals = getRecipeTotals(recipe);
    SUMMARY_FIELDS.forEach((field) => {
      weeklyTotals[field.key] += recipeTotals[field.key] || 0;
    });
    weeklyTotals.netCarb += recipeTotals.netCarb || 0;
    weeklyTotals.fiber_g += recipeTotals.fiber_g || 0;
    weeklyTotals.saturated_g += recipeTotals.saturated_g || 0;
    weeklyTotals.monounsaturated_g += recipeTotals.monounsaturated_g || 0;
    weeklyTotals.polyunsaturated_g += recipeTotals.polyunsaturated_g || 0;
  });
  const dailyTotals = {};
  Object.keys(weeklyTotals).forEach((key) => {
    dailyTotals[key] = weeklyTotals[key] / 7;
  });
  renderSummaryGrid(elements.dailyAverages, dailyTotals);
};

const escapeHtml = (text) =>
  (text || '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char];
  });

const renderRecipeCard = (recipe, index) => {
  const totals = getRecipeTotals(recipe);
  const quantityRows = recipe.ingredients
    .map((entry) => {
      const food = state.foodMap.get(entry.id);
      if (!food) return '';
      const quantity = sanitizeQuantity(entry.quantity ?? DEFAULT_QUANTITY);
      const grams = getEntryGrams(entry);
      const unitOptions = getUnitOptionsForFood(food);
      return `
        <tr>
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

  return `
    <section class="recipe-card ${recipe.collapsed ? 'collapsed' : ''}" data-recipe-id="${recipe.id}" draggable="true" data-index="${index}">
      <div class="recipe-card__header">
        <button type="button" class="icon-btn" aria-label="${recipe.collapsed ? 'Expand recipe' : 'Collapse recipe'}" data-toggle-recipe="${recipe.id}">
          ${recipe.collapsed ? '▸' : '▾'}
        </button>
        <input type="text" class="recipe-title" data-recipe-title="${recipe.id}" value="${escapeHtml(recipe.title)}" placeholder="Recipe title" ${recipe.collapsed ? 'readonly' : ''}>
        ${
          recipe.collapsed
            ? `<div class="recipe-collapsed-summary">${getRecipeCollapsedSummary(
                totals
              )}</div>`
            : ''
        }
        <button type="button" class="ghost-btn danger" data-remove-recipe="${recipe.id}">Delete</button>
      </div>
      <div class="recipe-card__body">
      <textarea class="recipe-description" data-recipe-description="${recipe.id}" rows="2" placeholder="Notes or description...">${escapeHtml(recipe.description || '')}</textarea>
      <label class="recipe-search-row" for="recipeSearch-${recipe.id}">
        <span class="search-label__title">Add ingredients</span>
        <input type="search" id="recipeSearch-${recipe.id}" placeholder="Search foods..." autocomplete="off" data-recipe-search="${recipe.id}" value="${escapeHtml(
          searchValue
        )}">
      </label>
      <div class="search-results" data-recipe-results="${recipe.id}"></div>
      <div class="meal-table-wrapper">
        <table class="meal-table">
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

const renderRecipes = () => {
  if (!elements.recipeList) return;
  elements.recipeList.innerHTML = state.recipes
    .map((recipe, index) => renderRecipeCard(recipe, index))
    .join('');
  state.recipes.forEach((recipe) => renderRecipeSearchResults(recipe.id));
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
    .filter(
      (food) =>
        !existingIds.has(food.id) &&
        food.name.toLowerCase().includes(term)
    )
    .slice(0, 5);
  if (!matches.length) {
    container.innerHTML = '<p class="helper-text">No foods found.</p>';
    return;
  }
  container.innerHTML = matches
    .map(
      (food) => `
      <div class="search-result">
        <div class="info">
          <span class="name">${food.name}</span>
          <span class="category">${formatNumber(food.calories)} kcal • ${formatNumber(
        food.protein_g
      )} g protein</span>
        </div>
        <button type="button" class="compare-btn" data-add-ingredient="${recipeId}" data-food-id="${food.id}">Add</button>
      </div>
    `
    )
    .join('');
};

const addRecipe = () => {
  const recipe = createRecipe();
  state.recipes.push(recipe);
  state.searchTerms[recipe.id] = '';
  persistRecipes();
  renderRecipes();
  renderSummaries();
};

const removeRecipe = (recipeId) => {
  state.recipes = state.recipes.filter((recipe) => recipe.id !== recipeId);
  delete state.searchTerms[recipeId];
  if (!state.recipes.length) {
    const fallback = createRecipe();
    state.recipes.push(fallback);
    state.searchTerms[fallback.id] = '';
  }
  persistRecipes();
  renderRecipes();
  renderSummaries();
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
  persistRecipes();
  renderRecipes();
  renderSummaries();
};

const removeIngredientFromRecipe = (recipeId, foodId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.ingredients = recipe.ingredients.filter((item) => item.id !== foodId);
  persistRecipes();
  renderRecipes();
  renderSummaries();
};

const handleQuantityChange = (recipeId, foodId, value) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const entry = recipe.ingredients.find((item) => item.id === foodId);
  if (!entry) return;
  entry.quantity = sanitizeQuantity(value);
  persistRecipes();
  renderSummaries();
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
  renderSummaries();
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
  recipe.title = title;
  persistRecipes();
};

const updateRecipeDescription = (recipeId, description) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.description = description;
  persistRecipes();
};

const getRecipeCollapsedSummary = (totals) => {
  const metrics = [
    `${formatNumber(totals.calories)} kcal`,
    `${formatNumber(totals.protein_g)} g protein`,
    `${formatNumber(totals.carbs_g)} g carbs`,
    `${formatNumber(totals.fat_g)} g fat`,
  ];
  return metrics.join(' • ');
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

const renderSearchResults = (recipeId) => {
  renderRecipeSearchResults(recipeId);
};

const attachEvents = () => {
  elements.addRecipeButton?.addEventListener('click', addRecipe);

  elements.recipeList?.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-recipe-title]')) {
      updateRecipeTitle(target.dataset.recipeTitle, target.value.trim());
    } else if (target.matches('[data-recipe-description]')) {
      updateRecipeDescription(target.dataset.recipeDescription, target.value);
    } else if (target.matches('[data-recipe-search]')) {
      const recipeId = target.dataset.recipeSearch;
      state.searchTerms[recipeId] = target.value;
      renderSearchResults(recipeId);
    }
  });

  elements.recipeList?.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('.meal-qty-input')) {
      const recipeId = target.dataset.quantityInput;
      const foodId = target.dataset.foodId;
      handleQuantityChange(recipeId, foodId, target.value);
      renderRecipes();
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

  elements.recipeList?.addEventListener('click', (event) => {
    const addBtn = event.target.closest('[data-add-ingredient]');
    if (addBtn) {
      addIngredientToRecipe(addBtn.dataset.addIngredient, addBtn.dataset.foodId);
      return;
    }
    const toggleBtn = event.target.closest('[data-toggle-recipe]');
    if (toggleBtn) {
      toggleRecipeCollapse(toggleBtn.dataset.toggleRecipe);
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
    }
  });

  let dropIndicator = document.createElement('div');
  dropIndicator.className = 'drop-indicator';
  let draggingRecipeId = null;

  const clearDropIndicator = () => {
    if (dropIndicator && dropIndicator.parentNode) {
      dropIndicator.parentNode.removeChild(dropIndicator);
    }
  };

  elements.recipeList?.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.recipe-card');
    if (!card) return;
    draggingRecipeId = card.dataset.recipeId || null;
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });

  elements.recipeList?.addEventListener('dragend', (event) => {
    const card = event.target.closest('.recipe-card');
    if (card) {
      card.classList.remove('dragging');
    }
    draggingRecipeId = null;
    clearDropIndicator();
  });

  elements.recipeList?.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!draggingRecipeId) return;
    if (event.target === dropIndicator) return;
    const targetCard = event.target.closest('.recipe-card');
    if (!targetCard) {
      elements.recipeList.appendChild(dropIndicator);
      return;
    }
    if (targetCard.dataset.recipeId === draggingRecipeId) return;
    const bounding = targetCard.getBoundingClientRect();
    const offset = event.clientY - bounding.top;
    const shouldInsertBefore = offset < bounding.height / 2;
    if (shouldInsertBefore) {
      targetCard.parentNode.insertBefore(dropIndicator, targetCard);
    } else {
      targetCard.parentNode.insertBefore(dropIndicator, targetCard.nextSibling);
    }
  });

  elements.recipeList?.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!draggingRecipeId || !dropIndicator.parentNode) {
      clearDropIndicator();
      return;
    }
    let insertIndex = state.recipes.length;
    let positionCounter = 0;
    for (const child of elements.recipeList.children) {
      if (child === dropIndicator) {
        insertIndex = positionCounter;
        break;
      }
      if (child.classList && child.classList.contains('recipe-card')) {
        positionCounter += 1;
      }
    }
    clearDropIndicator();
    const reorderedIds = state.recipes
      .map((recipe) => recipe.id)
      .filter((id) => id !== draggingRecipeId);
    if (insertIndex < 0 || insertIndex > reorderedIds.length) {
      reorderedIds.push(draggingRecipeId);
    } else {
      reorderedIds.splice(insertIndex, 0, draggingRecipeId);
    }
    state.recipes = reorderedIds
      .map((id) => state.recipes.find((recipe) => recipe.id === id))
      .filter(Boolean);
    persistRecipes();
    renderRecipes();
    renderSummaries();
    draggingRecipeId = null;
  });

  elements.recipeList?.addEventListener('dragleave', (event) => {
    if (!elements.recipeList.contains(event.relatedTarget)) {
      clearDropIndicator();
    }
  });
}; 

const bootstrap = async () => {
  try {
    state.recipes = await loadRecipes();
    state.recipes.forEach((recipe) => {
      if (!state.searchTerms[recipe.id]) state.searchTerms[recipe.id] = '';
    });
    const foods = await fetchJson('/api/foods');
    state.foods = foods;
    foods.forEach((food) => state.foodMap.set(food.id, food));
    renderRecipes();
    renderSummaries();
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
        '<p class="empty-state">Unable to load foods. Please refresh.</p>';
    }
  }
};

bootstrap();
