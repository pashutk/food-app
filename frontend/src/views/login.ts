import { login } from '../api';

export function renderLogin(container: HTMLElement) {
  container.innerHTML = `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div class="bg-white rounded-lg border border-gray-200 p-8 w-full max-w-sm">
        <h1 class="text-xl font-semibold text-gray-900 mb-6">Food & Menu Manager</h1>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input id="username" type="text" autocomplete="username"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="password" type="password" autocomplete="current-password"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div id="login-error" class="text-sm text-red-600 hidden"></div>
          <button type="submit"
            class="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">
            Sign in
          </button>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#login-form')!;
  const errEl = container.querySelector<HTMLDivElement>('#login-error')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (container.querySelector<HTMLInputElement>('#username')!).value.trim();
    const password = (container.querySelector<HTMLInputElement>('#password')!).value;
    errEl.classList.add('hidden');
    try {
      await login(username, password);
      location.hash = '#menu';
      location.reload();
    } catch (err) {
      errEl.textContent = (err as Error).message || 'Login failed';
      errEl.classList.remove('hidden');
    }
  });
}
