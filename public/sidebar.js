const NAV_ITEMS = [
  {
    key: 'library',
    href: 'index.html',
    label: 'Food library',
    helper: 'Search and filter every food.',
  },
  {
    key: 'compare',
    href: 'compare.html',
    label: 'Compare foods',
    helper: 'Stack nutrients head to head.',
    badge: true,
  },
  {
    key: 'recipes',
    href: 'recipes.html',
    label: 'Recipe library',
    helper: 'Maintain reusable dishes and notes.',
  },
    {
      key: 'meal',
      href: 'meal.html',
      label: 'Meal planner',
      helper: 'Design daily meals by section.',
    },
  {
    key: 'weekly',
    href: 'weekly.html',
    label: 'Weekly planner',
    helper: 'Organize weekly recipes & lists.',
  },
];

const TAGLINE =
  'Heal with every meal through mindful eating, deliciously sustainable and deeply nourishing.';

class AppSidebar extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    const activeKey = this.getAttribute('page') || 'library';
    const navLinks = NAV_ITEMS.map((item) => {
      const isActive = item.key === activeKey;
      const badgeMarkup = item.badge
        ? '<span class="nav-badge hidden" id="compareNavBadge">0</span>'
        : '';
      return `
        <a href="${item.href}" class="menu-link ${isActive ? 'active' : ''}">
          <div class="menu-link__body">
            <span class="menu-link__title">${item.label}</span>
            <span class="menu-link__helper">${item.helper}</span>
          </div>
          ${badgeMarkup}
        </a>
      `;
    }).join('');

    this.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-header">
          <p class="eyebrow">Powered by foods.json</p>
          <h1>Food Explorer</h1>
          <p class="helper-text helper-text--tagline">${TAGLINE}</p>
        </div>
        <nav class="sidebar-menu" aria-label="Primary navigation">
          ${navLinks}
        </nav>
      </aside>
    `;
  }
}

customElements.define('app-sidebar', AppSidebar);
