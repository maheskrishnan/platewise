const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5888;
const DATA_PATH = path.join(__dirname, 'foods.json');
const STORE_PATH = path.join(__dirname, 'data.json');

const stripInlineComments = (contents) =>
  contents.replace(/^[ \t]*\/\/.*$/gm, '');

const formatCategoryLabel = (id) =>
  id
    .split('_')
    .map((segment) =>
      segment.length ? segment[0].toUpperCase() + segment.slice(1) : segment
    )
    .join(' ');

const loadFoods = () => {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const cleaned = stripInlineComments(raw);
  const data = JSON.parse(cleaned);

  const entries = [];

  Object.entries(data).forEach(([categoryId, items]) => {
    const categoryLabel = formatCategoryLabel(categoryId);
    items.forEach((item, index) => {
      entries.push({
        ...item,
        id: `${categoryId}-${index}`,
        categoryId,
        categoryLabel,
      });
    });
  });

  return { data, entries };
};

const { data: foodsByCategory, entries: foodsList } = loadFoods();

const readStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(
        STORE_PATH,
        JSON.stringify(
          {
            mealPlans: null,
            weeklyRecipes: [],
          },
          null,
          2
        )
      );
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { mealPlans: null, weeklyRecipes: [] };
  }
};

const writeStore = (payload) => {
  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2));
};

const createEmptyMeals = () => ({
  breakfast: [],
  lunch: [],
  snack: [],
  dinner: [],
});

const createDefaultMealPlans = () => {
  const id = `plan-${Date.now()}`;
  return {
    plans: [
      {
        id,
        name: 'Daily plan',
        meals: createEmptyMeals(),
      },
    ],
    activePlanId: id,
  };
};

const ensureMealPlans = () => {
  const store = readStore();
  if (
    !store.mealPlans ||
    !Array.isArray(store.mealPlans.plans) ||
    !store.mealPlans.plans.length
  ) {
    store.mealPlans = createDefaultMealPlans();
    writeStore(store);
  }
  return store;
};

app.use(express.json());

const categories = Object.entries(foodsByCategory).map(([id, items]) => ({
  id,
  label: formatCategoryLabel(id),
  count: items.length,
}));

app.get('/api/categories', (_req, res) => {
  res.json(categories);
});

app.get('/api/foods', (req, res) => {
  const { category, search } = req.query;
  let results = foodsList;

  if (category) {
    const filters = Array.isArray(category) ? category : [category];
    results = results.filter((food) => filters.includes(food.categoryId));
  }

  if (search) {
    const needle = search.toString().toLowerCase();
    results = results.filter(
      (food) =>
        food.name.toLowerCase().includes(needle) ||
        food.categoryLabel.toLowerCase().includes(needle)
    );
  }

  res.json(results);
});

app.get('/api/meal-plans', (_req, res) => {
  try {
    const store = ensureMealPlans();
    res.json(store.mealPlans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to load plans' });
  }
});

app.post('/api/meal-plans', (req, res) => {
  try {
    const { plans, activePlanId } = req.body || {};
    if (!Array.isArray(plans)) {
      return res.status(400).json({ message: 'Plans must be an array' });
    }
    const store = readStore();
    store.mealPlans = {
      plans,
      activePlanId: activePlanId || null,
    };
    writeStore(store);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to save plans' });
  }
});

app.get('/api/weekly-plans', (_req, res) => {
  try {
    const store = readStore();
    res.json(Array.isArray(store.weeklyRecipes) ? store.weeklyRecipes : []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to load weekly recipes' });
  }
});

app.post('/api/weekly-plans', (req, res) => {
  try {
    const { recipes } = req.body || {};
    if (!Array.isArray(recipes)) {
      return res.status(400).json({ message: 'Recipes must be an array' });
    }
    const store = readStore();
    store.weeklyRecipes = recipes;
    writeStore(store);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to save weekly recipes' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected error' });
});

app.listen(PORT, () => {
  console.log(`Food explorer listening on port ${PORT}`);
});
