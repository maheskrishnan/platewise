const COMPARISON_STORAGE_KEY = 'foodSelections';
const DEFAULT_UNIT = 'g';
const DEFAULT_QUANTITY = 100;

const BASE_UNIT_OPTIONS = [
  { label: 'g', grams: 1 },
  { label: 'oz', grams: 28.3495 },
  { label: 'lb', grams: 453.592 },
];

const BASE_UNIT_MAP = BASE_UNIT_OPTIONS.reduce((acc, option) => {
  acc[option.label] = option;
  return acc;
}, {});

const MEAL_CONFIG = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
];

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

const state = {
  foods: [],
  foodMap: new Map(),
  plans: [],
  activePlanId: null,
  searchTerms: MEAL_CONFIG.reduce((acc, meal) => {
    acc[meal.key] = '';
    return acc;
  }, {}),
  sectionRefs: {},
  mealTotals: MEAL_CONFIG.reduce((acc, meal) => {
    acc[meal.key] = createTotalsSnapshot();
    return acc;
  }, {}),
  searchResults: MEAL_CONFIG.reduce((acc, meal) => {
    acc[meal.key] = [];
    return acc;
  }, {}),
  searchHighlights: MEAL_CONFIG.reduce((acc, meal) => {
    acc[meal.key] = -1;
    return acc;
  }, {}),
};

const elements = {
  mealSections: document.getElementById('mealSections'),
  dailyTotals: document.getElementById('dailyTotals'),
  planSelect: document.getElementById('planSelect'),
  planMeta: document.getElementById('planMeta'),
  addPlanButton: document.getElementById('addPlanButton'),
  renamePlanButton: document.getElementById('renamePlanButton'),
  deletePlanButton: document.getElementById('deletePlanButton'),
  compareNavBadge: document.getElementById('compareNavBadge'),
};

function createTotalsSnapshot() {
  return {
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
}

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
  return Math.round(number * 10) / 10;
};

const sanitizeQuantity = (value) => {
  const parsed = Number(value);
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

const createEmptyMeals = () =>
  MEAL_CONFIG.reduce((acc, meal) => {
    acc[meal.key] = [];
    return acc;
  }, {});

const makePlanId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `plan-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const normalizePlan = (plan) => {
  if (!plan || typeof plan !== 'object') {
    return null;
  }
  const normalized = {
    id: plan.id || makePlanId(),
    name: plan.name || 'Daily plan',
    meals: createEmptyMeals(),
  };
  MEAL_CONFIG.forEach((meal) => {
    const source =
      plan.meals && Array.isArray(plan.meals[meal.key])
        ? plan.meals[meal.key]
        : [];
    normalized.meals[meal.key] = source
      .map((entry) => {
        const unitLabel =
          typeof entry.unit === 'string' && entry.unit.length
            ? entry.unit
            : DEFAULT_UNIT;
        let quantity = entry.quantity;
        if (quantity === undefined || quantity === null) {
          if (entry.grams !== undefined) {
            quantity = Number(entry.grams) / getUnitBase(unitLabel);
          } else {
            quantity = DEFAULT_QUANTITY;
          }
        }
        const sanitizedQuantity = sanitizeQuantity(quantity);
        const unitGrams =
          Number(entry.unitGrams) && entry.unitGrams > 0
            ? entry.unitGrams
            : getUnitBase(unitLabel);
        return {
          id: entry.id,
          quantity: sanitizedQuantity,
          unit: unitLabel,
          unitGrams,
        };
      })
      .filter((entry) => Boolean(entry.id));
  });
  return normalized;
};

const defaultPlansState = () => {
  const initial = normalizePlan({
    id: makePlanId(),
    name: 'Daily plan',
    meals: createEmptyMeals(),
  });
  return {
    plans: [initial],
    activePlanId: initial.id,
  };
};

const loadPlans = async () => {
  try {
    const response = await fetch('/api/meal-plans');
    if (!response.ok) throw new Error('Failed to load plans');
    const data = await response.json();
    if (!data || !Array.isArray(data.plans) || !data.plans.length) {
      return defaultPlansState();
    }
    const plans = data.plans.map((plan) => normalizePlan(plan)).filter(Boolean);
    if (!plans.length) {
      return defaultPlansState();
    }
    const activePlanId = plans.some((plan) => plan.id === data.activePlanId)
      ? data.activePlanId
      : plans[0].id;
    return { plans, activePlanId };
  } catch (error) {
    console.error(error);
    return defaultPlansState();
  }
};

const persistPlans = async () => {
  try {
    await fetch('/api/meal-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plans: state.plans,
        activePlanId: state.activePlanId,
      }),
    });
  } catch (error) {
    console.error('Failed to save meal plans', error);
  }
};

const getActivePlan = () =>
  state.plans.find((plan) => plan.id === state.activePlanId) || null;

const getMealItems = (mealKey) => {
  const plan = getActivePlan();
  if (!plan) return [];
  if (!Array.isArray(plan.meals[mealKey])) {
    plan.meals[mealKey] = [];
  }
  return plan.meals[mealKey];
};

const getMealTotals = (mealKey) => {
  const totals = createTotalsSnapshot();
  const entries = getMealItems(mealKey);
  entries.forEach((entry) => {
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

const formatCellValue = (key, value) => {
  if (key === 'calories') {
    return `${formatNumber(value)} kcal`;
  }
  return `${formatNumber(value)} g`;
};

const getNutrientBreakdown = (food, grams) => {
  const factor = grams / 100;
  return {
    calories: (food.calories || 0) * factor,
    protein_g: (food.protein_g || 0) * factor,
    carbs_g: (food.carbs_g || 0) * factor,
    netCarb:
      ((food.carbs_g || 0) - (food.fiber_g || 0)) * factor,
    fat_g: (food.fat_g || 0) * factor,
    fiber_g: (food.fiber_g || 0) * factor,
  };
};

const ensureValidPlans = () => {
  let mutated = false;
  state.plans.forEach((plan) => {
    MEAL_CONFIG.forEach((meal) => {
      if (!Array.isArray(plan.meals[meal.key])) {
        plan.meals[meal.key] = [];
        mutated = true;
        return;
      }
      const filtered = plan.meals[meal.key]
        .filter((entry) => state.foodMap.has(entry.id))
        .map((entry) => {
          const normalized = { ...entry };
          if (!normalized.unit || typeof normalized.unit !== 'string') {
            normalized.unit = DEFAULT_UNIT;
            mutated = true;
          }
          if (normalized.quantity === undefined) {
            normalized.quantity = DEFAULT_QUANTITY;
            mutated = true;
          } else {
            const cleanQty = sanitizeQuantity(normalized.quantity);
            if (cleanQty !== normalized.quantity) {
              normalized.quantity = cleanQty;
              mutated = true;
            }
          }
          if (!normalized.unitGrams || normalized.unitGrams <= 0) {
            normalized.unitGrams = getUnitBase(normalized.unit);
            mutated = true;
          }
          return normalized;
        });
      if (filtered.length !== plan.meals[meal.key].length) {
        plan.meals[meal.key] = filtered;
        mutated = true;
      } else {
        plan.meals[meal.key] = filtered;
      }
    });
  });
  if (mutated) {
    persistPlans();
  }
};

const renderPlanOptions = () => {
  if (!elements.planSelect) return;
  elements.planSelect.innerHTML = state.plans
    .map(
      (plan) =>
        `<option value="${plan.id}">${plan.name}</option>`
    )
    .join('');
  elements.planSelect.value = state.activePlanId;
};

const updatePlanMeta = () => {
  if (!elements.planMeta) return;
  const plan = getActivePlan();
  if (!plan) {
    elements.planMeta.textContent =
      'No plan selected. Create one to start planning meals.';
    return;
  }
  const totalFoods = MEAL_CONFIG.reduce(
    (acc, meal) => acc + plan.meals[meal.key].length,
    0
  );
  elements.planMeta.textContent = `Editing "${plan.name}" — ${totalFoods} food${
    totalFoods === 1 ? '' : 's'
  } scheduled for the day. Adjust the quantity or unit to tune servings.`;
};

const createMealSection = (meal) => {
  const section = document.createElement('section');
  section.className = 'meal-section';
  section.dataset.meal = meal.key;
  section.innerHTML = `
    <div class="meal-section__header">
      <div>
        <h3>${meal.label}</h3>
      </div>
      <div class="meal-section__totals" data-meal-summary="${meal.key}">
        <strong>0 kcal</strong>
        <span>0 g protein • 0 g net carb</span>
      </div>
    </div>
    <div class="meal-section__body">
      <label class="search-label" for="${meal.key}Search">
        <span>Add foods</span>
        <input type="search" id="${meal.key}Search" placeholder="Search foods..." autocomplete="off" data-meal-search="${meal.key}">
      </label>
      <div class="search-results" data-search-results="${meal.key}"></div>
      <div class="meal-table-wrapper">
        <table class="meal-table">
          <thead>
            <tr>
              <th>Food</th>
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
          <tbody data-meal-table="${meal.key}"></tbody>
        </table>
      </div>
    </div>
  `;
  return section;
};

const initMealSections = () => {
  if (!elements.mealSections) return;
  elements.mealSections.innerHTML = '';
  state.sectionRefs = {};
  MEAL_CONFIG.forEach((meal) => {
    const section = createMealSection(meal);
    elements.mealSections.appendChild(section);
    state.sectionRefs[meal.key] = {
      tableBody: section.querySelector(`[data-meal-table="${meal.key}"]`),
      summary: section.querySelector(`[data-meal-summary="${meal.key}"]`),
      searchResults: section.querySelector(
        `[data-search-results="${meal.key}"]`
      ),
      searchInput: section.querySelector(`[data-meal-search="${meal.key}"]`),
    };
  });
};

const renderMealSection = (mealKey) => {
  const refs = state.sectionRefs[mealKey];
  if (!refs) return;
  const items = getMealItems(mealKey);
  if (!items.length) {
    refs.tableBody.innerHTML = `<tr><td colspan="10" class="meal-empty">No foods added yet.</td></tr>`;
  } else {
    const rows = items
      .map((entry) => {
        const food = state.foodMap.get(entry.id);
        if (!food) return '';
        const quantity = sanitizeQuantity(entry.quantity ?? DEFAULT_QUANTITY);
        const unit = entry.unit || DEFAULT_UNIT;
        const grams = getEntryGrams(entry);
        const unitOptions = getUnitOptionsForFood(food);
        const breakdown = getNutrientBreakdown(food, grams);
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
              <input type="text" inputmode="decimal" value="${quantity}" class="meal-qty-input" data-quantity-input="${mealKey}" data-food-id="${entry.id}">
                <select data-unit-select="${mealKey}" data-food-id="${entry.id}">
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
            <td>${formatCellValue('calories', breakdown.calories)}</td>
            <td>${formatCellValue('protein_g', breakdown.protein_g)}</td>
            <td>${formatCellValue('carbs_g', breakdown.carbs_g)}</td>
            <td>${formatCellValue('netCarb', breakdown.netCarb)}</td>
            <td>${formatCellValue('fat_g', breakdown.fat_g)}</td>
            <td>${formatCellValue('fiber_g', breakdown.fiber_g)}</td>
            <td class="action-cell">
              <button type="button" class="text-link" data-remove-food="${mealKey}" data-food-id="${entry.id}">Remove</button>
            </td>
          </tr>
        `;
      })
      .join('');
    refs.tableBody.innerHTML = rows;
  }
  const totals = getMealTotals(mealKey);
  state.mealTotals[mealKey] = totals;
  if (refs.summary) {
    refs.summary.innerHTML = `
      <strong>${formatNumber(totals.calories)} kcal</strong>
      <span>${formatNumber(totals.protein_g)} g protein • ${formatNumber(
      totals.netCarb
    )} g net carb</span>
    `;
  }
  renderSearchResults(mealKey);
};

const renderMealSections = () => {
  MEAL_CONFIG.forEach((meal) => renderMealSection(meal.key));
  renderDailyTotals();
  updatePlanMeta();
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

const renderDailyTotals = () => {
  if (!elements.dailyTotals) return;
  const totals = createTotalsSnapshot();
  MEAL_CONFIG.forEach((meal) => {
    const mealTotals = state.mealTotals[meal.key] || createTotalsSnapshot();
    totals.calories += mealTotals.calories;
    totals.protein_g += mealTotals.protein_g;
    totals.carbs_g += mealTotals.carbs_g;
    totals.fat_g += mealTotals.fat_g;
    totals.fiber_g += mealTotals.fiber_g;
    totals.cholesterol_mg += mealTotals.cholesterol_mg;
    totals.sodium_mg += mealTotals.sodium_mg;
    totals.saturated_g += mealTotals.saturated_g;
    totals.monounsaturated_g += mealTotals.monounsaturated_g;
    totals.polyunsaturated_g += mealTotals.polyunsaturated_g;
  });
  totals.netCarb = totals.carbs_g - totals.fiber_g;

  elements.dailyTotals.innerHTML = SUMMARY_FIELDS.map((field) => {
    const dvText = formatDailyValuePercent(field, totals);
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

const renderSearchResults = (mealKey) => {
  const refs = state.sectionRefs[mealKey];
  if (!refs || !refs.searchResults) return;
  const term = state.searchTerms[mealKey].trim().toLowerCase();
  if (!term) {
    refs.searchResults.innerHTML = '';
    state.searchHighlights[mealKey] = -1;
    state.searchResults[mealKey] = [];
    return;
  }
  const existingIds = new Set(getMealItems(mealKey).map((item) => item.id));
  const matches = state.foods
    .filter((food) => food.name.toLowerCase().includes(term))
    .slice(0, 5)
    .map((food) => ({
      food,
      disabled: existingIds.has(food.id),
    }));
  state.searchResults[mealKey] = matches;
  if (!matches.length) {
    refs.searchResults.innerHTML =
      '<p class="helper-text">No foods match your search.</p>';
    state.searchHighlights[mealKey] = -1;
    return;
  }
  refs.searchResults.innerHTML = matches
    .map(
      ({ food, disabled }, index) => `
        <div class="search-result ${disabled ? 'disabled' : ''}" data-search-index="${index}">
          <div class="info">
            <span class="name">${food.name}</span>
            <span class="category">${formatNumber(
              food.calories
            )} kcal • ${formatNumber(food.protein_g)} g protein</span>
          </div>
          <button type="button" class="compare-btn" data-add-food="${mealKey}" data-food-id="${food.id}" ${
        disabled ? 'disabled' : ''
      }>
            ${disabled ? 'Added' : 'Add'}
          </button>
        </div>
      `
    )
    .join('');
  updateMealSearchHighlight(mealKey);
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
  if (suggestions.length) {
    return suggestions;
  }
  const options = [];
  const seen = new Set();
  BASE_UNIT_OPTIONS.forEach((unit) => {
    if (seen.has(unit.label.toLowerCase())) return;
    seen.add(unit.label.toLowerCase());
    options.push({
      key: unit.label,
      label: unit.label,
      grams: unit.grams,
    });
  });
  return options;
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

const addFoodToMeal = (mealKey, foodId) => {
  const food = state.foodMap.get(foodId);
  if (!food) return;
  const items = getMealItems(mealKey);
  const existing = items.find((entry) => entry.id === foodId);
  if (existing) {
    const currentGrams = getEntryGrams(existing);
    const defaultServing = getDefaultServingForFood(food);
    const increment = clampGrams(
      defaultServing.quantity * defaultServing.unitGrams
    );
    const newGrams = clampGrams(currentGrams + increment);
    const base =
      Number(existing.unitGrams) && existing.unitGrams > 0
        ? existing.unitGrams
        : getUnitBase(existing.unit);
    existing.quantity = sanitizeQuantity(newGrams / base);
  } else {
    const serving = getDefaultServingForFood(food);
    items.push({
      id: foodId,
      quantity: serving.quantity,
      unit: serving.unit,
      unitGrams: serving.unitGrams,
    });
  }
  persistPlans();
  renderMealSection(mealKey);
  renderDailyTotals();
  state.searchHighlights[mealKey] = -1;
  state.searchResults[mealKey] = [];
  focusMealSearch(mealKey);
};

const removeFoodFromMeal = (mealKey, foodId) => {
  const items = getMealItems(mealKey);
  const index = items.findIndex((entry) => entry.id === foodId);
  if (index >= 0) {
    items.splice(index, 1);
    persistPlans();
    renderMealSection(mealKey);
    renderDailyTotals();
  }
};

const handleQuantityChange = (mealKey, foodId, value) => {
  const items = getMealItems(mealKey);
  const entry = items.find((item) => item.id === foodId);
  if (!entry) return;
  entry.quantity = sanitizeQuantity(value);
  persistPlans();
  renderMealSection(mealKey);
  renderDailyTotals();
};

const handleUnitChange = (mealKey, foodId, unit, gramsPerUnit) => {
  const items = getMealItems(mealKey);
  const entry = items.find((item) => item.id === foodId);
  if (!entry) return;
  entry.unit = unit || DEFAULT_UNIT;
  entry.unitGrams =
    Number.isFinite(gramsPerUnit) && gramsPerUnit > 0
      ? gramsPerUnit
      : getUnitBase(entry.unit);
  persistPlans();
  renderMealSection(mealKey);
  renderDailyTotals();
};

const clearMealSearch = (mealKey) => {
  const refs = state.sectionRefs[mealKey];
  state.searchTerms[mealKey] = '';
  state.searchHighlights[mealKey] = -1;
  state.searchResults[mealKey] = [];
  if (refs?.searchInput) {
    refs.searchInput.value = '';
  }
  if (refs?.searchResults) {
    refs.searchResults.innerHTML = '';
  }
};

const focusMealSearch = (mealKey) => {
  const refs = state.sectionRefs[mealKey];
  if (refs?.searchInput) {
    requestAnimationFrame(() => {
      refs.searchInput.focus();
      refs.searchInput.select();
    });
  }
};

const updateMealSearchHighlight = (mealKey) => {
  const refs = state.sectionRefs[mealKey];
  if (!refs?.searchResults) return;
  const rows = refs.searchResults.querySelectorAll('.search-result');
  const activeIndex = state.searchHighlights[mealKey] ?? -1;
  rows.forEach((row, index) => {
    row.classList.toggle('active', index === activeIndex);
  });
};

const switchActivePlan = (planId) => {
  if (state.activePlanId === planId) return;
  state.activePlanId = planId;
  persistPlans();
  MEAL_CONFIG.forEach((meal) => clearMealSearch(meal.key));
  renderPlanOptions();
  renderMealSections();
};

const getSuggestedPlanName = () => {
  const usedNames = new Set(state.plans.map((plan) => plan.name));
  let counter = state.plans.length + 1;
  let name = `Plan ${counter}`;
  while (usedNames.has(name)) {
    counter += 1;
    name = `Plan ${counter}`;
  }
  return name;
};

const addPlan = () => {
  const name = window.prompt('Name your meal plan', getSuggestedPlanName());
  const planName = name && name.trim() ? name.trim() : getSuggestedPlanName();
  const newPlan = {
    id: makePlanId(),
    name: planName,
    meals: createEmptyMeals(),
  };
  state.plans.push(newPlan);
  state.activePlanId = newPlan.id;
  persistPlans();
  renderPlanOptions();
  clearMealSearches();
  renderMealSections();
};

const renamePlan = () => {
  const plan = getActivePlan();
  if (!plan) return;
  const name = window.prompt('Rename meal plan', plan.name);
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  plan.name = trimmed;
  persistPlans();
  renderPlanOptions();
  updatePlanMeta();
};

const deletePlan = () => {
  if (state.plans.length === 1) {
    const plan = getActivePlan();
    if (!plan) return;
    if (window.confirm('Clear all foods from this plan?')) {
      plan.meals = createEmptyMeals();
      persistPlans();
      clearMealSearches();
      renderMealSections();
    }
    return;
  }
  if (!window.confirm('Delete this plan? This cannot be undone.')) {
    return;
  }
  state.plans = state.plans.filter((plan) => plan.id !== state.activePlanId);
  if (!state.plans.length) {
    const fallback = defaultPlansState();
    state.plans = fallback.plans;
    state.activePlanId = fallback.activePlanId;
  } else {
    state.activePlanId = state.plans[0].id;
  }
  persistPlans();
  clearMealSearches();
  renderPlanOptions();
  renderMealSections();
};

const clearMealSearches = () => {
  MEAL_CONFIG.forEach((meal) => clearMealSearch(meal.key));
};

const updateCompareNavBadge = () => {
  if (!elements.compareNavBadge) return;
  try {
    const stored = localStorage.getItem(COMPARISON_STORAGE_KEY);
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

const handleMealSearchKeyDown = (event) => {
  const input = event.target;
  const mealKey = input.dataset.mealSearch;
  const results = state.searchResults[mealKey] || [];
  if (!results.length) return;
  let index = state.searchHighlights[mealKey] ?? -1;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    index = Math.min(index + 1, results.length - 1);
    state.searchHighlights[mealKey] = index;
    updateMealSearchHighlight(mealKey);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    index = Math.max(index - 1, -1);
    state.searchHighlights[mealKey] = index;
    updateMealSearchHighlight(mealKey);
    return;
  }
  if (event.key === 'Enter' && index >= 0) {
    event.preventDefault();
    const result = results[index];
    if (result && !result.disabled) {
      addFoodToMeal(mealKey, result.food.id);
      clearMealSearch(mealKey);
      focusMealSearch(mealKey);
    }
    return;
  }
  if (event.key === 'Escape') {
    state.searchHighlights[mealKey] = -1;
    updateMealSearchHighlight(mealKey);
  }
};

const initPlanControls = () => {
  if (elements.planSelect) {
    elements.planSelect.addEventListener('change', (event) => {
      const planId = event.target.value;
      switchActivePlan(planId);
    });
  }
  elements.addPlanButton?.addEventListener('click', addPlan);
  elements.renamePlanButton?.addEventListener('click', renamePlan);
  elements.deletePlanButton?.addEventListener('click', deletePlan);
};

const initSectionEvents = () => {
  if (!elements.mealSections) return;
  elements.mealSections.addEventListener('input', (event) => {
    const input = event.target;
    if (input.matches('[data-meal-search]')) {
      const mealKey = input.dataset.mealSearch;
      state.searchTerms[mealKey] = input.value;
       state.searchHighlights[mealKey] = -1;
      renderSearchResults(mealKey);
    }
  });

  elements.mealSections.addEventListener('change', (event) => {
    const input = event.target;
    if (input.matches('.meal-qty-input')) {
      const mealKey = input.dataset.quantityInput;
      const foodId = input.dataset.foodId;
      handleQuantityChange(mealKey, foodId, input.value);
    }
    if (input.matches('[data-unit-select]')) {
      const mealKey = input.dataset.unitSelect;
      const foodId = input.dataset.foodId;
      const selected = input.selectedOptions[0];
      const grams =
        selected && selected.dataset.grams
          ? Number(selected.dataset.grams)
          : undefined;
      handleUnitChange(mealKey, foodId, input.value, grams);
    }
  });

  elements.mealSections.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-food]');
    if (addButton) {
      const mealKey = addButton.getAttribute('data-add-food');
      const foodId = addButton.getAttribute('data-food-id');
      addFoodToMeal(mealKey, foodId);
      clearMealSearch(mealKey);
      focusMealSearch(mealKey);
      return;
    }
    const removeButton = event.target.closest('[data-remove-food]');
    if (removeButton) {
      const mealKey = removeButton.getAttribute('data-remove-food');
      const foodId = removeButton.getAttribute('data-food-id');
      removeFoodFromMeal(mealKey, foodId);
    }
  });

  elements.mealSections.addEventListener('keydown', (event) => {
    const input = event.target;
    if (input.matches('[data-meal-search]')) {
      handleMealSearchKeyDown(event);
    }
  });
};

const bootstrap = async () => {
  try {
    const plansState = await loadPlans();
    state.plans = plansState.plans;
    state.activePlanId = plansState.activePlanId;
    const foods = await fetchJson('/api/foods');
    state.foods = foods;
    foods.forEach((food) => state.foodMap.set(food.id, food));
    ensureValidPlans();
    initMealSections();
    renderPlanOptions();
    initPlanControls();
    initSectionEvents();
    renderMealSections();
    updateCompareNavBadge();
  } catch (error) {
    console.error(error);
    if (elements.mealSections) {
      elements.mealSections.innerHTML =
        '<p class="empty-state">Unable to load foods. Please refresh the page.</p>';
    }
  }
};

window.addEventListener('storage', (event) => {
  if (event.key === COMPARISON_STORAGE_KEY) {
    updateCompareNavBadge();
  }
});

bootstrap();
