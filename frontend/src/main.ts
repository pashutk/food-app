import './styles/main.css';
import { isAuthenticated, logout } from './api';
import { renderLogin } from './views/login';
import { renderMenuBuilder } from './views/menuBuilder';
import { renderDishLibrary } from './views/dishLibrary';
import { renderDishEditor } from './views/dishEditor';
import { renderShoppingList } from './views/shoppingList';
import { icon, CALENDAR, BOOK, CART } from './icons';

function getView() {
  const h = location.hash;
  if (h.startsWith('#editor')) return 'editor';
  if (h === '#library') return 'library';
  if (h === '#shopping') return 'shopping';
  return 'menu';
}

function getActiveTab() {
  const h = location.hash;
  if (h.startsWith('#editor') || h === '#library') return 'library';
  if (h === '#shopping') return 'shopping';
  return 'menu';
}

function navTab(id: string, label: string, activeTab: string) {
  const active = activeTab === id;
  const cls = active
    ? 'border-b-2 border-blue-600 text-blue-600'
    : 'border-b-2 border-transparent text-gray-600 hover:text-gray-900';
  return `<a href="#${id}" class="flex items-center gap-1.5 px-3 py-3 text-sm font-medium ${cls}">${label}</a>`;
}

function renderApp() {
  const app = document.getElementById('app')!;

  if (!isAuthenticated()) {
    renderLogin(app);
    return;
  }

  const view = getView();
  const tab = getActiveTab();

  app.innerHTML = `
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div class="max-w-3xl mx-auto px-4">
          <div class="flex items-center justify-between h-14">
            <span class="font-semibold text-gray-900">Food & Menu Manager</span>
            <button id="logout-btn" class="text-sm text-gray-500 hover:text-gray-700">Logout</button>
          </div>
          <nav class="flex -mb-px gap-1">
            ${navTab('menu', icon(CALENDAR) + ' Menu', tab)}
            ${navTab('library', icon(BOOK) + ' Library', tab)}
            ${navTab('shopping', icon(CART) + ' Shopping', tab)}
          </nav>
        </div>
      </header>
      <main class="flex-1 max-w-3xl mx-auto w-full px-4 py-6" id="main-content"></main>
    </div>
  `;

  document.getElementById('logout-btn')!.addEventListener('click', () => {
    logout();
    renderApp();
  });

  const content = document.getElementById('main-content')!;

  if (view === 'menu') renderMenuBuilder(content);
  else if (view === 'library') renderDishLibrary(content);
  else if (view === 'editor') {
    const id = location.hash.startsWith('#editor-')
      ? parseInt(location.hash.slice('#editor-'.length))
      : null;
    renderDishEditor(content, isNaN(id as number) ? null : id, () => {
      location.hash = '#library';
    });
  }
  else if (view === 'shopping') renderShoppingList(content);
}

window.addEventListener('hashchange', renderApp);
renderApp();
