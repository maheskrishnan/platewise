# Food Explorer & Comparator

An Express + vanilla JavaScript web app for browsing foods from `foods.json`, filtering them by category or search, and comparing up to six foods at a time with a detailed nutrient table.

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the server**

   ```bash
   npm start
   ```

   The app runs at [http://localhost:5888](http://localhost:5888). Static assets are served from `public/` and the API endpoints live under `/api`.

   For hot reloading during development:

   ```bash
   npm run dev
   ```

3. **Views**

   Navigate via the left menu:
   - **Food Library (`index.html`)** – Browse, filter, sort, and add foods to the comparison queue.
   - **Compare Foods (`compare.html`)** – View/remove the queued foods and inspect the detailed nutrient table.

## Available Endpoints

- `GET /api/categories` – List of category ids, friendly labels, and food counts.
- `GET /api/foods` – All foods flattened with their category metadata. Supports optional `category` and `search` query parameters for server-side filtering.

The server loads the JSON file once at startup, stripping inline comments to keep the data flexible without breaking parsing.

## Front-end Highlights

- Category filters, keyword search, and real-time result counts.
- Sorting dropdown (name, calories, protein, fat) to quickly rank foods.
- List-style presentation with calories/macros + micronutrient highlights for faster scanning.
- Comparison queue pins up to six selections in the library view; the dedicated comparison page renders the detailed table (macros, fats, carbs, fiber, cholesterol, vitamins, minerals) with a toggle for per-100 g, per-100-calorie, and per-454 g (1 lb) normalization.
- Fully responsive layout with CSS Grid/Flexbox and no client-side framework dependency.

## Project Structure

```
foods.json          # Dataset
server.js           # Express server + API
public/
  index.html        # UI skeleton
  styles.css        # Layout + design
  app.js            # Food library logic (fetching, filtering, queue)
  compare.html      # Dedicated comparison page
  compare.js        # Comparison-table logic
```

## Notes & Next Steps

- For local tweaks to `foods.json`, keep the structure consistent; the UI automatically surfaces any new nutrients you add to the objects.
- Ideas for future enhancements: persistence of selections across reloads, sorting tools (e.g., highest protein), or downloadable comparison tables.
