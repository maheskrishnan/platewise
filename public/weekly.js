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

const makeWeeklyPlanId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `weekly-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const createDefaultPlanState = () => {
  const id = makeWeeklyPlanId();
  return {
    plans: [
      {
        id,
        name: 'Weekly plan',
        recipes: [],
      },
    ],
    activePlanId: id,
  };
};

const normalizeRecipe = (recipe) => ({
  id:
    recipe.id ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `recipe-${Date.now()}-${Math.floor(Math.random() * 10000)}`),
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

const normalizePlan = (plan) => ({
  id: plan.id || makeWeeklyPlanId(),
  name: plan.name || 'Weekly plan',
  recipes: Array.isArray(plan.recipes)
    ? plan.recipes.map(normalizeRecipe)
    : [],
});

const state = {
  foods: [],
  foodMap: new Map(),
  plan: createDefaultPlanState(),
  searchTerms: {},
  searchResults: {},
  searchHighlights: {},
  libraryRecipes: [],
};

const elements = {
  recipeList: document.getElementById('recipeList'),
  dailyAverages: document.getElementById('dailyAverages'),
  addRecipeButton: document.getElementById('addRecipeButton'),
  importRecipeButton: document.getElementById('importRecipeButton'),
  compareNavBadge: document.getElementById('compareNavBadge'),
  shoppingList: document.getElementById('weeklyShoppingList'),
  printShoppingButton: document.getElementById('printShoppingList'),
  shoppingToggle: document.querySelector('[data-toggle-shopping]'),
  shoppingCard: document.querySelector('[data-shopping-card]'),
  shoppingToggleLabel: document.querySelector('[data-shopping-toggle-label]'),
  planSelect: document.getElementById('weeklyPlanSelect'),
  addPlanBtn: document.getElementById('addWeeklyPlan'),
  clonePlanBtn: document.getElementById('cloneWeeklyPlan'),
  renamePlanBtn: document.getElementById('renameWeeklyPlan'),
  deletePlanBtn: document.getElementById('deleteWeeklyPlan'),
  importModal: document.getElementById('importRecipeModal'),
  importList: document.getElementById('importRecipeList'),
  closeImportModal: document.getElementById('closeImportModal'),
};

let videoModalElement = null;
let videoModalKeyHandler = null;

const getActivePlan = () => {
  if (!state.plan.plans.length) {
    state.plan = createDefaultPlanState();
  }
  let plan = state.plan.plans.find(
    (plan) => plan.id === state.plan.activePlanId
  );
  if (!plan) {
    plan = state.plan.plans[0];
    state.plan.activePlanId = plan.id;
  }
  if (!Array.isArray(plan.recipes)) {
    plan.recipes = [];
  }
  return plan;
};

const getActiveRecipes = () => getActivePlan().recipes;

const ensureSearchTerms = () => {
  getActiveRecipes().forEach((recipe) => {
    if (typeof state.searchTerms[recipe.id] !== 'string') {
      state.searchTerms[recipe.id] = '';
    }
    if (!Array.isArray(state.searchResults[recipe.id])) {
      state.searchResults[recipe.id] = [];
    }
    if (typeof state.searchHighlights[recipe.id] !== 'number') {
      state.searchHighlights[recipe.id] = -1;
    }
  });
};

const pruneSearchTerms = () => {
  const validIds = new Set(
    state.plan.plans.flatMap((plan) =>
      Array.isArray(plan.recipes) ? plan.recipes.map((recipe) => recipe.id) : []
    )
  );
  Object.keys(state.searchTerms).forEach((key) => {
    if (!validIds.has(key)) {
      delete state.searchTerms[key];
      delete state.searchResults[key];
      delete state.searchHighlights[key];
    }
  });
};

const renderPlanOptions = () => {
  if (!elements.planSelect) return;
  elements.planSelect.innerHTML = state.plan.plans
    .map(
      (plan) =>
        `<option value="${escapeHtml(plan.id)}">${escapeHtml(
          plan.name || 'Weekly plan'
        )}</option>`
    )
    .join('');
  elements.planSelect.value = state.plan.activePlanId;
};

const getPlanNameSuggestion = () => {
  const existing = new Set(
    state.plan.plans.map((plan) => (plan.name || '').toLowerCase())
  );
  let counter = state.plan.plans.length + 1;
  let name = `Weekly plan ${counter}`;
  while (existing.has(name.toLowerCase())) {
    counter += 1;
    name = `Weekly plan ${counter}`;
  }
  return name;
};

const selectPlan = (planId) => {
  if (state.plan.activePlanId === planId) return;
  if (!state.plan.plans.some((plan) => plan.id === planId)) return;
  state.plan.activePlanId = planId;
  ensureSearchTerms();
  pruneSearchTerms();
  renderPlanOptions();
  renderRecipes();
  renderSummaries();
  persistPlans();
};

const addWeeklyPlan = () => {
  const name = window.prompt('Name your weekly plan', getPlanNameSuggestion());
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const newPlan = {
    id: makeWeeklyPlanId(),
    name: trimmed,
    recipes: [],
  };
  state.plan.plans.push(newPlan);
  state.plan.activePlanId = newPlan.id;
  ensureSearchTerms();
  renderPlanOptions();
  renderRecipes();
  renderSummaries();
  persistPlans();
};

const renameWeeklyPlan = () => {
  const plan = getActivePlan();
  if (!plan) return;
  const name = window.prompt('Rename weekly plan', plan.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  plan.name = trimmed;
  renderPlanOptions();
  persistPlans();
};

const cloneWeeklyPlan = () => {
  const plan = getActivePlan();
  if (!plan) return;
  const newPlan = {
    id: makeWeeklyPlanId(),
    name: `${plan.name || 'Weekly plan'} (copy)`,
    recipes: plan.recipes.map((recipe) => ({
      ...recipe,
      id: makeWeeklyPlanId(),
      ingredients: recipe.ingredients.map((entry) => ({ ...entry })),
    })),
  };
  state.plan.plans.push(newPlan);
  state.plan.activePlanId = newPlan.id;
  ensureSearchTerms();
  renderPlanOptions();
  renderRecipes();
  renderSummaries();
  persistPlans();
};

const deleteWeeklyPlan = () => {
  const plan = getActivePlan();
  if (!plan) return;
  if (state.plan.plans.length === 1) {
    if (!window.confirm('Clear all recipes in this plan?')) return;
    plan.recipes = [];
    ensureSearchTerms();
    renderRecipes();
    renderSummaries();
    persistPlans();
    return;
  }
  if (!window.confirm('Delete this weekly plan?')) return;
  state.plan.plans = state.plan.plans.filter((p) => p.id !== plan.id);
  state.plan.activePlanId = state.plan.plans[0]?.id || makeWeeklyPlanId();
  ensureSearchTerms();
  pruneSearchTerms();
  renderPlanOptions();
  renderRecipes();
  renderSummaries();
  persistPlans();
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
  if (value === null || value === undefined || value === '') {
    return DEFAULT_QUANTITY;
  }
  const trimmed = String(value).trim();
  if (trimmed === '.' || trimmed === '-') {
    return DEFAULT_QUANTITY;
  }
  const parsed = Number(trimmed);
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

const loadPlans = async () => {
  try {
    const response = await fetch('/api/weekly-plans');
    if (!response.ok) throw new Error('Failed to load weekly plans');
    const data = await response.json();
    if (!data || !Array.isArray(data.plans) || !data.plans.length) {
      return createDefaultPlanState();
    }
    const plans = data.plans.map(normalizePlan);
    const activePlanId = plans.some((plan) => plan.id === data.activePlanId)
      ? data.activePlanId
      : plans[0].id;
    return { plans, activePlanId };
  } catch (error) {
    console.error(error);
    return createDefaultPlanState();
  }
};

const persistPlans = async () => {
  try {
    await fetch('/api/weekly-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.plan),
    });
  } catch (error) {
    console.error('Failed to save weekly plans', error);
  }
};

const getRecipeById = (recipeId) =>
  getActiveRecipes().find((recipe) => recipe.id === recipeId);

const loadLibraryRecipes = async () => {
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
    sugar_g: 0,
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
    totals.sugar_g += (food.sugar_g || 0) * factor;
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
  const weeklyTotals = createTotalsSnapshot();
  getActiveRecipes().forEach((recipe) => {
    const recipeTotals = getRecipeTotals(recipe);
    SUMMARY_FIELDS.forEach((field) => {
      weeklyTotals[field.key] += recipeTotals[field.key] || 0;
      if (Array.isArray(field.sublines)) {
        field.sublines.forEach((sub) => {
          weeklyTotals[sub.key] =
            (weeklyTotals[sub.key] || 0) + (recipeTotals[sub.key] || 0);
        });
      }
    });
  });
  const dailyTotals = {};
  Object.keys(weeklyTotals).forEach((key) => {
    dailyTotals[key] = weeklyTotals[key] / 7;
  });
  renderSummaryGrid(elements.dailyAverages, dailyTotals);
};

const groupShoppingItems = (items) => {
  const meats = [];
  const veggies = [];
  const fruits = [];
  const other = [];
  items.forEach((item) => {
    const category = (item.category || '').toLowerCase();
    if (
      category.includes('meat') ||
      category.includes('seafood') ||
      category.includes('egg')
    ) {
      meats.push(item);
    } else if (category.includes('vegetable')) {
      veggies.push(item);
    } else if (category.includes('fruit')) {
      fruits.push(item);
    } else {
      other.push(item);
    }
  });
  const sortItems = (list) => list.sort((a, b) => a.name.localeCompare(b.name));
  return {
    meats: sortItems(meats),
    veggies: sortItems(veggies),
    fruits: sortItems(fruits),
    other: sortItems(other),
  };
};

const renderShoppingList = () => {
  if (!elements.shoppingList) return;
  const totalsMap = new Map();
  getActiveRecipes().forEach((recipe) => {
    recipe.ingredients.forEach((entry) => {
      const food = state.foodMap.get(entry.id);
      if (!food) return;
      const grams = getEntryGrams(entry);
      const current = totalsMap.get(entry.id) || {
        name: food.name,
        category: food.categoryLabel,
        entries: [],
      };
      current.entries.push({
        quantity: entry.quantity,
        unit: entry.unit,
        unitGrams: entry.unitGrams,
        grams,
      });
      totalsMap.set(entry.id, current);
    });
  });
  if (!totalsMap.size) {
    elements.shoppingList.innerHTML =
      '<p class="helper-text">No ingredients yet. Add recipes to build your list.</p>';
    return;
  }
  const grouped = groupShoppingItems(
    Array.from(totalsMap.values()).map((item) => {
      const baseEntry = item.entries[0];
      let unit = baseEntry?.unit || 'g';
      let unitGrams = baseEntry?.unitGrams || null;
      let totalQuantity = 0;
      let gramsTotal = 0;
      let consistent = true;
      item.entries.forEach((entry) => {
        gramsTotal += entry.grams;
        if (entry.unit === unit && entry.unitGrams === unitGrams) {
          totalQuantity += entry.quantity;
        } else {
          consistent = false;
        }
      });
      if (!consistent) {
        unit = 'g';
        totalQuantity = gramsTotal;
        unitGrams = null;
      }
      return {
        name: item.name,
        category: item.category,
        totalQuantity,
        preferredUnit: unit,
      };
    })
  );
  const renderColumn = (title, items) => `
    <div class="shopping-column">
      <h4>${title}</h4>
      <ul>
        ${
          items.length
            ? items
                .map(
                  (item) =>
                    `<li>
                      <span>${item.name}</span>
                      <strong>${formatNumber(item.totalQuantity)} ${
                      item.preferredUnit || 'g'
                    }</strong>
                    </li>`
                )
                .join('')
            : '<li class="empty">—</li>'
        }
      </ul>
    </div>
  `;
  elements.shoppingList.innerHTML = `
    <div class="shopping-grid">
      ${renderColumn('Meats & Seafood', grouped.meats)}
      ${renderColumn('Vegetables', grouped.veggies)}
      ${renderColumn('Fruits', grouped.fruits)}
      ${renderColumn('Other', grouped.other)}
    </div>
  `;
};

const openShoppingListPrintView = () => {
  if (!elements.shoppingList) return;
  const content = elements.shoppingList.innerHTML.trim();
  if (!content) return;
  const planName = escapeHtml(getActivePlan().name || 'Weekly plan');
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    window.alert('Pop-up blocked. Allow pop-ups to preview the shopping list.');
    return;
  }
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${planName} – Shopping list</title>
        <link rel="stylesheet" href="styles.css">
        <style>
          :root {
            color-scheme: light;
          }
          body {
            font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 1.5rem;
            color: #0f172a;
            background: #f8fafc;
          }
          .preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
          }
          .preview-header h1 {
            margin: 0 0 0.25rem;
            font-size: 1.6rem;
          }
          .preview-header p {
            margin: 0;
            color: #475569;
          }
          .preview-actions {
            display: flex;
            gap: 0.5rem;
          }
          .preview-actions button {
            border-radius: 999px;
            padding: 0.4rem 1rem;
            border: 1px solid #cbd5f5;
            background: #fff;
            cursor: pointer;
            font-size: 0.95rem;
          }
          .preview-actions button.primary {
            background: #1d4ed8;
            border-color: #1d4ed8;
            color: #fff;
          }
          .preview-body {
            background: #fff;
            border-radius: 16px;
            padding: 1rem;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
          }
          @media print {
            body {
              margin: 0.5in;
              background: #fff;
            }
            .preview-actions {
              display: none;
            }
            .preview-body {
              box-shadow: none;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="preview-header">
          <div>
            <p>Plan: ${planName}</p>
            <h1>Weekly shopping list</h1>
          </div>
          <div class="preview-actions">
            <button type="button" onclick="window.close()">Close</button>
            <button type="button" class="primary" onclick="window.print()">Print</button>
          </div>
        </div>
        <div class="preview-body">
          ${content}
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
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
    <section class="recipe-card ${recipe.collapsed ? 'collapsed' : ''}" data-recipe-id="${recipe.id}" draggable="true" data-index="${index}">
      <div class="recipe-card__header">
        <button type="button" class="icon-btn" aria-label="${recipe.collapsed ? 'Expand recipe' : 'Collapse recipe'}" data-toggle-recipe="${recipe.id}">
          ${recipe.collapsed ? '▸' : '▾'}
        </button>
        <div class="recipe-title-wrapper" data-recipe-title-wrapper="${recipe.id}">
          <button type="button" class="recipe-title-display" data-edit-title="${recipe.id}">
            ${escapeHtml(recipe.title)}
          </button>
          <input type="text" class="recipe-title-input" data-recipe-title-input="${recipe.id}" value="${escapeHtml(recipe.title)}" />
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
          <button type="button" class="ghost-btn" data-export-recipe="${recipe.id}">Export</button>
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

const renderRecipes = () => {
  if (!elements.recipeList) return;
  elements.recipeList.innerHTML = getActiveRecipes()
    .map((recipe, index) => renderRecipeCard(recipe, index))
    .join('');
  getActiveRecipes().forEach((recipe) => renderRecipeSearchResults(recipe.id));
  renderShoppingList();
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
  const input = document.querySelector(`[data-recipe-search="${recipeId}"]`);
  if (input) {
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }
};

const scrollToRecipe = (recipeId) => {
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-recipe-id="${recipeId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
};

const renderRecipeSearchResults = (recipeId) => {
  const container = document.querySelector(
    `[data-recipe-results="${recipeId}"]`
  );
  if (!container) return;
  const term = (state.searchTerms[recipeId] || '').trim().toLowerCase();
  if (!term) {
    container.innerHTML = '';
    state.searchResults[recipeId] = [];
    state.searchHighlights[recipeId] = -1;
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
        <button type="button" class="compare-btn" data-add-ingredient="${recipeId}" data-food-id="${food.id}" ${
        disabled ? 'disabled' : ''
      }>${disabled ? 'Added' : 'Add'}</button>
      </div>
    `
    )
    .join('');
  updateSearchHighlight(recipeId);
};

const addRecipe = () => {
  const recipe = createRecipe();
  getActiveRecipes().push(recipe);
  state.searchTerms[recipe.id] = '';
  state.searchHighlights[recipe.id] = -1;
  state.searchResults[recipe.id] = [];
  persistPlans();
  renderRecipes();
  renderSummaries();
  scrollToRecipe(recipe.id);
};

const removeRecipe = (recipeId) => {
  const recipes = getActiveRecipes();
  const index = recipes.findIndex((recipe) => recipe.id === recipeId);
  if (index === -1) return;
  recipes.splice(index, 1);
  delete state.searchTerms[recipeId];
  delete state.searchResults[recipeId];
  delete state.searchHighlights[recipeId];
  if (!recipes.length) {
    const fallback = createRecipe();
    recipes.push(fallback);
    state.searchTerms[fallback.id] = '';
    state.searchResults[fallback.id] = [];
    state.searchHighlights[fallback.id] = -1;
  }
  pruneSearchTerms();
  persistPlans();
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
  state.searchHighlights[recipeId] = -1;
  state.searchResults[recipeId] = [];
  persistPlans();
  renderRecipes();
  renderSummaries();
  focusRecipeSearch(recipeId);
};

const removeIngredientFromRecipe = (recipeId, foodId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.ingredients = recipe.ingredients.filter((item) => item.id !== foodId);
  persistPlans();
  renderRecipes();
  renderSummaries();
};

const handleQuantityChange = (recipeId, foodId, value) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  const entry = recipe.ingredients.find((item) => item.id === foodId);
  if (!entry) return;
  entry.quantity = sanitizeQuantity(value);
  persistPlans();
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
  persistPlans();
  renderSummaries();
  renderRecipes();
};

const toggleRecipeCollapse = (recipeId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.collapsed = !recipe.collapsed;
  persistPlans();
  renderRecipes();
};

const handleRecipeSearchKeyDown = (event) => {
  const input = event.target;
  const recipeId = input.dataset.recipeSearch;
  const results = state.searchResults[recipeId] || [];
  if (!results.length) return;
  let index = state.searchHighlights[recipeId] ?? -1;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    index = Math.min(index + 1, results.length - 1);
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
    }
    return;
  }
  if (event.key === 'Escape') {
    state.searchHighlights[recipeId] = -1;
    updateSearchHighlight(recipeId);
  }
};

const updateRecipeTitle = (recipeId, title) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.title = title;
  persistPlans();
};

const updateRecipeDescription = (recipeId, description) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  recipe.description = description;
  persistPlans();
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

  const closeModal = () => {
    modal.remove();
  };

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

const renderImportList = () => {
  if (!elements.importList) return;
  if (!state.libraryRecipes.length) {
    elements.importList.innerHTML =
      '<p class="helper-text">No recipes in your library yet.</p>';
    return;
  }
  elements.importList.innerHTML = state.libraryRecipes
    .map(
      (recipe) => `
        <button type="button" class="import-item" data-import-id="${recipe.id}">
          <span>${escapeHtml(recipe.title)}</span>
          <span class="helper-text">${recipe.ingredients.length} ingredient${
        recipe.ingredients.length === 1 ? '' : 's'
      }</span>
        </button>
      `
    )
    .join('');
};

const openImportModal = () => {
  if (!elements.importModal) return;
  renderImportList();
  elements.importModal.classList.remove('hidden');
  elements.importModal.setAttribute('aria-hidden', 'false');
};

const closeImportModal = () => {
  if (!elements.importModal) return;
  elements.importModal.classList.add('hidden');
  elements.importModal.setAttribute('aria-hidden', 'true');
};

const importRecipeFromLibrary = (recipeId) => {
  const source = state.libraryRecipes.find((recipe) => recipe.id === recipeId);
  if (!source) return;
  const cloned = normalizeRecipe({
    ...source,
    id: undefined,
    collapsed: false,
  });
  getActiveRecipes().push(cloned);
  state.searchTerms[cloned.id] = '';
  state.searchResults[cloned.id] = [];
  state.searchHighlights[cloned.id] = -1;
  persistPlans();
  renderRecipes();
  renderSummaries();
  closeImportModal();
  scrollToRecipe(cloned.id);
};

const attachEvents = () => {
  elements.planSelect?.addEventListener('change', (event) => {
    selectPlan(event.target.value);
  });
  elements.addPlanBtn?.addEventListener('click', addWeeklyPlan);
  elements.clonePlanBtn?.addEventListener('click', cloneWeeklyPlan);
  elements.renamePlanBtn?.addEventListener('click', renameWeeklyPlan);
  elements.deletePlanBtn?.addEventListener('click', deleteWeeklyPlan);
  elements.printShoppingButton?.addEventListener(
    'click',
    openShoppingListPrintView
  );

  elements.addRecipeButton?.addEventListener('click', addRecipe);
  elements.importRecipeButton?.addEventListener('click', openImportModal);
  elements.closeImportModal?.addEventListener('click', closeImportModal);
  elements.importModal?.addEventListener('click', (event) => {
    if (event.target === elements.importModal) {
      closeImportModal();
    }
  });
  elements.importList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-import-id]');
    if (button) {
      importRecipeFromLibrary(button.dataset.importId);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.importModal?.classList.contains('hidden')) {
      closeImportModal();
    }
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
      renderSearchResults(recipeId);
      return;
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
      return;
    }
  });

  elements.recipeList?.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target.matches('[data-recipe-title-input]') && event.key === 'Enter') {
      event.preventDefault();
      const { recipeTitleInput } = target.dataset;
      updateRecipeTitle(recipeTitleInput, target.value.trim());
      toggleTitleEditing(recipeTitleInput, false);
    } else if (target.matches('[data-recipe-search]')) {
      handleRecipeSearchKeyDown(event);
    }
  });

  elements.recipeList?.addEventListener(
    'mousedown',
    (event) => {
      const addBtn = event.target.closest('[data-add-ingredient]');
      if (addBtn) {
        event.preventDefault();
        addIngredientToRecipe(
          addBtn.dataset.addIngredient,
          addBtn.dataset.foodId
        );
      }
    },
    true
  );

  elements.recipeList?.addEventListener('click', (event) => {
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
    const exportBtn = event.target.closest('[data-export-recipe]');
    if (exportBtn) {
      exportRecipeToLibrary(exportBtn.dataset.exportRecipe);
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

  let ingredientDragState = {
    recipeId: null,
    sourceIndex: -1,
    indicator: null,
  };

  const clearIngredientDragIndicator = () => {
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
    clearIngredientDragIndicator();
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
      clearIngredientDragIndicator();
      return;
    }
    const children = Array.from(tbody.children);
    if (!children.includes(ingredientDragState.indicator)) {
      clearIngredientDragIndicator();
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
      clearIngredientDragIndicator();
      return;
    }
    const fromIndex = ingredientDragState.sourceIndex;
    if (fromIndex < 0 || fromIndex >= recipe.ingredients.length) {
      clearIngredientDragIndicator();
      return;
    }
    const [moved] = recipe.ingredients.splice(fromIndex, 1);
    const adjustedIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    const boundedIndex = Math.max(0, Math.min(adjustedIndex, recipe.ingredients.length));
    if (boundedIndex === fromIndex) {
      clearIngredientDragIndicator();
      return;
    }
    recipe.ingredients.splice(boundedIndex, 0, moved);
    persistPlans();
    renderRecipes();
    clearIngredientDragIndicator();
    ingredientDragState.recipeId = null;
    ingredientDragState.sourceIndex = -1;
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
    let insertIndex = getActiveRecipes().length;
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
    const plan = getActivePlan();
    const recipes = plan.recipes;
    const fromIndex = recipes.findIndex(
      (recipe) => recipe.id === draggingRecipeId
    );
    if (fromIndex === -1) {
      draggingRecipeId = null;
      return;
    }
    const [dragged] = recipes.splice(fromIndex, 1);
    const boundedIndex = Math.min(
      Math.max(insertIndex, 0),
      recipes.length
    );
    recipes.splice(boundedIndex, 0, dragged);
    persistPlans();
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
    const [planState, foods, libraryRecipes] = await Promise.all([
      loadPlans(),
      fetchJson('/api/foods'),
      loadLibraryRecipes(),
    ]);
    state.plan = planState;
    getActivePlan();
    ensureSearchTerms();
    pruneSearchTerms();
    renderPlanOptions();

    state.foods = foods;
    state.foodMap.clear();
    foods.forEach((food) => state.foodMap.set(food.id, food));
    state.libraryRecipes = libraryRecipes;

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
  elements.shoppingToggle?.addEventListener('click', () => {
    if (!elements.shoppingCard) return;
    const collapsed = elements.shoppingCard.classList.toggle('collapsed');
    if (elements.shoppingToggleLabel) {
      elements.shoppingToggleLabel.textContent = collapsed ? '▸' : '▾';
    }
  });
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

const exportRecipeToLibrary = async (recipeId) => {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return;
  try {
    const payload = normalizeRecipe(recipe);
    const response = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ append: true, recipe: payload }),
    });
    if (!response.ok) throw new Error('Failed to export recipe');
    const data = await response.json();
    if (Array.isArray(data)) {
      state.libraryRecipes = data.map(normalizeRecipe);
    }
    alert('Recipe added to your library.');
  } catch (error) {
    console.error(error);
    alert('Unable to export recipe.');
  }
};
