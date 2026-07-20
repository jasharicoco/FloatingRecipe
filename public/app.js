const state = {
  user: null,
  recipes: [],
  activeId: null,
  editingId: null,
  query: '',
  toastTimer: null,
};

const elements = {
  boot: document.querySelector('#boot-status'),
  landingView: document.querySelector('#landing-view'),
  authView: document.querySelector('#auth-view'),
  appView: document.querySelector('#app-view'),
  authBack: document.querySelector('#auth-back'),
  landingAuthButtons: document.querySelectorAll('[data-auth-mode]'),
  previewSearch: document.querySelector('#preview-search'),
  clearPreviewSearch: document.querySelector('#clear-preview-search'),
  previewStatus: document.querySelector('#preview-status'),
  previewField: document.querySelector('#landing-preview-field'),
  previewCards: document.querySelectorAll('[data-preview-search]'),
  previewEmpty: document.querySelector('#preview-empty'),
  showLogin: document.querySelector('#show-login'),
  showRegister: document.querySelector('#show-register'),
  loginForm: document.querySelector('#login-form'),
  registerForm: document.querySelector('#register-form'),
  loginError: document.querySelector('#login-error'),
  registerError: document.querySelector('#register-error'),
  passwordToggles: document.querySelectorAll('.password-toggle'),
  floatingInputs: document.querySelectorAll('.floating-field > input, .floating-field > textarea'),
  accountChip: document.querySelector('#account-chip'),
  accountName: document.querySelector('#account-name'),
  logout: document.querySelector('#logout'),
  field: document.querySelector('#recipe-field'),
  search: document.querySelector('#recipe-search'),
  clearSearch: document.querySelector('.clear-search'),
  resetSearch: document.querySelector('#reset-search'),
  status: document.querySelector('#search-status'),
  empty: document.querySelector('#empty-state'),
  emptyMessage: document.querySelector('#empty-message'),
  add: document.querySelector('#add-recipe'),
  detailDialog: document.querySelector('#detail-dialog'),
  detailTitle: document.querySelector('#detail-title'),
  detailContent: document.querySelector('#detail-content'),
  edit: document.querySelector('#edit-recipe'),
  askDelete: document.querySelector('#ask-delete'),
  formDialog: document.querySelector('#form-dialog'),
  form: document.querySelector('#recipe-form'),
  formTitle: document.querySelector('#form-title'),
  formEyebrow: document.querySelector('#form-dialog .eyebrow'),
  titleInput: document.querySelector('#recipe-title'),
  contentInput: document.querySelector('#recipe-content'),
  formError: document.querySelector('#form-error'),
  save: document.querySelector('#save-recipe'),
  deleteDialog: document.querySelector('#delete-dialog'),
  deleteName: document.querySelector('#delete-recipe-name'),
  confirmDelete: document.querySelector('#confirm-delete'),
  toast: document.querySelector('#toast'),
};

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function syncFloatingLabel(input) {
  input.closest('.floating-field')?.classList.toggle('is-filled', input.value.length > 0);
}

function syncFloatingLabels() {
  elements.floatingInputs.forEach(syncFloatingLabel);
}

function seeded(seed, minimum, maximum) {
  const normalized = (seed % 10_000) / 10_000;
  return minimum + normalized * (maximum - minimum);
}

function searchableText(recipe) {
  return `${recipe.title}\n${recipe.content}`.toLocaleLowerCase('sv-SE');
}

function filteredRecipes() {
  const query = state.query.trim().toLocaleLowerCase('sv-SE');
  return query ? state.recipes.filter((recipe) => searchableText(recipe).includes(query)) : state.recipes;
}

function cardForRecipe(recipe) {
  const shell = document.createElement('div');
  const seed = hash(recipe.id);
  const width = Math.round(seeded(seed, 190, 232));
  const height = Math.round(seeded(seed >>> 3, 178, 218));
  const rotation = seeded(seed >>> 7, -3.7, 3.7).toFixed(2);
  const driftX = seeded(seed >>> 11, 4, 11).toFixed(1);
  const driftY = seeded(seed >>> 15, -8, 8).toFixed(1);
  const turn = seeded(seed >>> 19, 0.35, 1.05).toFixed(2);
  const duration = seeded(seed >>> 4, 15, 24).toFixed(1);

  shell.className = 'card-shell is-entering';
  shell.dataset.id = recipe.id;
  shell.style.setProperty('--card-width', `${width}px`);
  shell.style.setProperty('--card-height', `${height}px`);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `recipe-card color-${recipe.color}`;
  button.setAttribute('aria-label', `Öppna receptet ${recipe.title}`);
  button.style.setProperty('--rotation', `${rotation}deg`);
  button.style.setProperty('--drift-x', `${driftX}px`);
  button.style.setProperty('--drift-y', `${driftY}px`);
  button.style.setProperty('--turn', `${turn}deg`);
  button.style.setProperty('--duration', `${duration}s`);
  button.style.setProperty('--delay', `-${(seed % 14).toFixed(1)}s`);

  const title = document.createElement('h2');
  const preview = document.createElement('p');
  button.append(title, preview);
  button.addEventListener('click', () => openDetail(recipe.id));
  shell.append(button);
  updateCard(shell, recipe);
  return shell;
}

function updateCard(shell, recipe) {
  const button = shell.querySelector('.recipe-card');
  button.className = `recipe-card color-${recipe.color}`;
  button.setAttribute('aria-label', `Öppna receptet ${recipe.title}`);
  shell.querySelector('h2').textContent = recipe.title;
  shell.querySelector('p').textContent = recipe.content.replace(/\s+/g, ' ').trim() || 'En tom receptlapp';
}

function renderRecipes({ introducedId = null } = {}) {
  const visible = filteredRecipes();
  const visibleIds = new Set(visible.map((recipe) => recipe.id));
  const existing = new Map(
    [...elements.field.querySelectorAll('.card-shell')].map((shell) => [shell.dataset.id, shell]),
  );

  for (const [id, shell] of existing) {
    if (visibleIds.has(id)) continue;
    shell.classList.add('is-leaving');
    window.setTimeout(() => {
      if (!filteredRecipes().some((recipe) => recipe.id === id)) shell.remove();
    }, 280);
  }

  for (const recipe of visible) {
    let shell = existing.get(recipe.id);
    if (!shell) {
      shell = cardForRecipe(recipe);
      elements.field.append(shell);
      window.requestAnimationFrame(() => shell.classList.remove('is-entering'));
    } else {
      shell.classList.remove('is-leaving');
      updateCard(shell, recipe);
    }
    if (recipe.id === introducedId) shell.classList.add('is-entering');
  }

  elements.empty.hidden = visible.length > 0;
  elements.emptyMessage.textContent = state.recipes.length === 0
    ? 'Här är det tomt än så länge. Lägg till din första receptlapp.'
    : 'Inga lappar matchar din sökning.';
  elements.resetSearch.hidden = state.recipes.length === 0 || !state.query;
  elements.status.textContent = state.query
    ? `${visible.length} av ${state.recipes.length} recept visas`
    : `${state.recipes.length} ${state.recipes.length === 1 ? 'receptlapp' : 'receptlappar'}`;
  elements.status.classList.toggle('is-visible', Boolean(state.query));
  layoutCards();

  if (introducedId) {
    window.requestAnimationFrame(() => {
      elements.field.querySelector(`[data-id="${CSS.escape(introducedId)}"]`)?.classList.remove('is-entering');
    });
  }
}

function layoutCards() {
  const cards = filteredRecipes()
    .map((recipe) => elements.field.querySelector(`[data-id="${CSS.escape(recipe.id)}"]`))
    .filter(Boolean);
  const width = elements.field.clientWidth;
  const mobile = width < 560;
  const topPadding = mobile ? 8 : 10;
  let requiredHeight = window.innerHeight - (mobile ? 105 : 150);

  if (mobile) {
    let y = topPadding;
    cards.forEach((shell, index) => {
      const cardWidth = Math.min(282, width - 44);
      shell.style.setProperty('--card-width', `${cardWidth}px`);
      const seed = hash(shell.dataset.id);
      const offset = seeded(seed >>> 6, -18, 18);
      const x = Math.max(18, Math.min(width - cardWidth - 18, (width - cardWidth) / 2 + offset));
      shell.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      y += shell.offsetHeight + 25 + (index % 2) * 8;
    });
    requiredHeight = Math.max(requiredHeight, y + 90);
  } else {
    const sidePadding = Math.max(28, width * 0.025);
    const usableWidth = width - sidePadding * 2;
    const columns = Math.max(2, Math.min(5, Math.floor(usableWidth / 250)));
    const columnWidth = usableWidth / columns;
    const heights = Array(columns).fill(topPadding);

    cards.forEach((shell) => {
      const seed = hash(shell.dataset.id);
      const baseWidth = Math.round(seeded(seed, 190, 232));
      shell.style.setProperty('--card-width', `${baseWidth}px`);
      const column = heights.indexOf(Math.min(...heights));
      const maxJitter = Math.max(0, (columnWidth - baseWidth) * 0.34);
      const jitterX = seeded(seed >>> 5, -maxJitter, maxJitter);
      const jitterY = seeded(seed >>> 13, 4, 34);
      const x = sidePadding + column * columnWidth + (columnWidth - baseWidth) / 2 + jitterX;
      const y = heights[column] + jitterY;
      shell.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      heights[column] = y + shell.offsetHeight + seeded(seed >>> 17, 20, 42);
    });
    requiredHeight = Math.max(requiredHeight, Math.max(...heights, 0) + 90);
  }

  elements.field.style.height = `${requiredHeight}px`;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/') && path !== '/api/session') {
      showLanding();
    }
    const error = new Error(body.message || 'Något gick fel.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function resetPrivateState() {
  window.clearTimeout(state.toastTimer);
  state.user = null;
  state.recipes = [];
  state.activeId = null;
  state.editingId = null;
  state.query = '';
  elements.search.value = '';
  syncFloatingLabel(elements.search);
  elements.field.querySelectorAll('.card-shell').forEach((card) => card.remove());
  elements.toast.classList.remove('is-visible');
  elements.toast.textContent = '';
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  elements.appView.hidden = true;
  elements.add.hidden = true;
  elements.accountChip.hidden = true;
}

function showLanding() {
  resetPrivateState();
  elements.previewSearch.value = '';
  syncFloatingLabel(elements.previewSearch);
  filterPreview();
  elements.boot.hidden = true;
  elements.authView.hidden = true;
  elements.landingView.hidden = false;
  window.scrollTo(0, 0);
}

function setAuthMode(mode) {
  const login = mode === 'login';
  elements.loginForm.hidden = !login;
  elements.registerForm.hidden = login;
  elements.showLogin.classList.toggle('is-active', login);
  elements.showRegister.classList.toggle('is-active', !login);
  elements.showLogin.setAttribute('aria-pressed', String(login));
  elements.showRegister.setAttribute('aria-pressed', String(!login));
  elements.loginError.hidden = true;
  elements.registerError.hidden = true;
  window.requestAnimationFrame(() => {
    (login ? elements.loginForm.elements.email : elements.registerForm.elements.name).focus();
  });
}

function showAuth(mode = 'login') {
  resetPrivateState();
  elements.boot.hidden = true;
  elements.landingView.hidden = true;
  elements.authView.hidden = false;
  setAuthMode(mode);
}

async function showApp(user) {
  state.user = user;
  elements.boot.hidden = true;
  elements.landingView.hidden = true;
  elements.authView.hidden = true;
  elements.appView.hidden = false;
  elements.add.hidden = false;
  elements.accountChip.hidden = false;
  elements.accountName.textContent = user.name;
  await loadRecipes();
}

function filterPreview() {
  const query = elements.previewSearch.value.trim().toLocaleLowerCase('sv-SE');
  const visibleCards = [];
  elements.previewCards.forEach((shell) => {
    const matches = !query || shell.dataset.previewSearch.includes(query);
    shell.hidden = !matches;
    shell.style.removeProperty('top');
    shell.style.removeProperty('right');
    shell.style.removeProperty('left');
    shell.style.removeProperty('transform');
    if (matches) visibleCards.push(shell);
  });
  const visible = visibleCards.length;
  const filteringDesktop = Boolean(query) && window.innerWidth > 640;
  elements.previewField.classList.toggle('is-filtering', Boolean(query));
  elements.previewField.style.removeProperty('height');

  if (filteringDesktop && visible > 0) {
    const columns = Math.min(4, visible);
    const rows = Math.ceil(visible / columns);
    elements.previewField.style.height = `${Math.max(320, rows * 255 + 55)}px`;
    visibleCards.forEach((shell, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const itemsInRow = Math.min(columns, visible - row * columns);
      const position = ((column + 0.5) / itemsInRow) * 100;
      shell.style.left = `calc(${position}% - ${shell.offsetWidth / 2}px)`;
      shell.style.top = `${45 + row * 245 + (column % 2) * 22}px`;
      shell.style.right = 'auto';
    });
  }
  elements.clearPreviewSearch.hidden = !query;
  elements.previewEmpty.hidden = visible > 0;
  elements.previewStatus.textContent = query
    ? `${visible} av ${elements.previewCards.length} exempellappar matchar`
    : `${elements.previewCards.length} receptlappar i förhandsvisningen`;
  elements.previewStatus.classList.toggle('is-visible', Boolean(query));
}

async function loadRecipes() {
  try {
    state.recipes = await request('/api/recipes');
    renderRecipes();
  } catch (error) {
    if (error.status === 401) return;
    elements.status.textContent = 'Recepten kunde inte laddas.';
    elements.status.classList.add('is-visible');
    showToast(error.message);
  }
}

async function submitAuth(form, path, errorElement) {
  const submit = form.querySelector('button[type="submit"]');
  const originalLabel = submit.textContent;
  const payload = Object.fromEntries(new FormData(form));
  errorElement.hidden = true;
  submit.disabled = true;
  submit.textContent = path.endsWith('register') ? 'Skapar konto…' : 'Loggar in…';
  try {
    const { user } = await request(path, { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    window.requestAnimationFrame(syncFloatingLabels);
    await showApp(user);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
}

function recipeById(id) {
  return state.recipes.find((recipe) => recipe.id === id);
}

function openDetail(id) {
  const recipe = recipeById(id);
  if (!recipe) return;
  state.activeId = id;
  elements.detailTitle.textContent = recipe.title;
  elements.detailContent.textContent = recipe.content;
  elements.detailDialog.className = `paper-dialog detail-dialog color-${recipe.color}`;
  elements.detailDialog.showModal();
}

function openForm(recipe = null) {
  state.editingId = recipe?.id || null;
  elements.form.reset();
  elements.formTitle.textContent = recipe ? 'Redigera recept' : 'Lägg till recept';
  elements.formEyebrow.textContent = recipe ? 'Justera receptlappen' : 'Ny receptlapp';
  elements.titleInput.value = recipe?.title || '';
  elements.contentInput.value = recipe?.content || '';
  syncFloatingLabel(elements.titleInput);
  syncFloatingLabel(elements.contentInput);
  const selectedColor = recipe?.color || 'butter';
  elements.form.elements.color.value = selectedColor;
  elements.formError.hidden = true;
  elements.formDialog.showModal();
  elements.titleInput.focus();
}

function closeDialog(id) {
  document.getElementById(id)?.close();
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

elements.search.addEventListener('input', () => {
  state.query = elements.search.value;
  elements.clearSearch.hidden = !state.query;
  renderRecipes();
});

function clearSearch() {
  elements.search.value = '';
  syncFloatingLabel(elements.search);
  state.query = '';
  elements.clearSearch.hidden = true;
  renderRecipes();
  elements.search.focus();
}

elements.clearSearch.addEventListener('click', clearSearch);
elements.resetSearch.addEventListener('click', clearSearch);
elements.add.addEventListener('click', () => openForm());
elements.previewSearch.addEventListener('input', filterPreview);
elements.clearPreviewSearch.addEventListener('click', () => {
  elements.previewSearch.value = '';
  syncFloatingLabel(elements.previewSearch);
  filterPreview();
  elements.previewSearch.focus();
});
elements.landingAuthButtons.forEach((button) => {
  button.addEventListener('click', () => showAuth(button.dataset.authMode));
});
elements.authBack.addEventListener('click', showLanding);
elements.showLogin.addEventListener('click', () => setAuthMode('login'));
elements.showRegister.addEventListener('click', () => setAuthMode('register'));
elements.floatingInputs.forEach((input) => {
  input.addEventListener('input', () => syncFloatingLabel(input));
  input.addEventListener('change', () => syncFloatingLabel(input));
});
document.addEventListener('reset', () => window.requestAnimationFrame(syncFloatingLabels));
syncFloatingLabels();
elements.passwordToggles.forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.getAttribute('aria-controls')}`);
    const showPassword = input.type === 'password';
    input.type = showPassword ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(showPassword));
    button.setAttribute('aria-label', showPassword ? 'Dölj lösenord' : 'Visa lösenord');
  });
});
elements.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuth(elements.loginForm, '/api/auth/login', elements.loginError);
});
elements.registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuth(elements.registerForm, '/api/auth/register', elements.registerError);
});
elements.logout.addEventListener('click', async () => {
  elements.logout.disabled = true;
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    elements.logout.disabled = false;
    showLanding();
  }
});

elements.edit.addEventListener('click', () => {
  const recipe = recipeById(state.activeId);
  if (!recipe) return;
  elements.detailDialog.close();
  openForm(recipe);
});

elements.askDelete.addEventListener('click', () => {
  const recipe = recipeById(state.activeId);
  if (!recipe) return;
  elements.detailDialog.close();
  elements.deleteName.textContent = recipe.title;
  elements.deleteDialog.showModal();
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!elements.titleInput.value.trim()) {
    elements.formError.textContent = 'Ge receptet ett namn.';
    elements.formError.hidden = false;
    elements.titleInput.focus();
    return;
  }

  const payload = {
    title: elements.titleInput.value,
    content: elements.contentInput.value,
    color: elements.form.elements.color.value,
  };
  const existingId = state.editingId;
  elements.save.disabled = true;
  elements.save.textContent = 'Sparar…';
  elements.formError.hidden = true;

  try {
    const recipe = await request(existingId ? `/api/recipes/${encodeURIComponent(existingId)}` : '/api/recipes', {
      method: existingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (existingId) {
      state.recipes = state.recipes.map((item) => item.id === existingId ? recipe : item);
    } else {
      state.recipes.push(recipe);
    }
    elements.formDialog.close();
    renderRecipes({ introducedId: existingId ? null : recipe.id });
    showToast(existingId ? 'Receptet är uppdaterat.' : 'En ny receptlapp är sparad.');
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  } finally {
    elements.save.disabled = false;
    elements.save.textContent = 'Spara recept';
  }
});

elements.confirmDelete.addEventListener('click', async () => {
  const recipe = recipeById(state.activeId);
  if (!recipe) return;
  elements.confirmDelete.disabled = true;
  elements.confirmDelete.textContent = 'Tar bort…';
  try {
    await request(`/api/recipes/${encodeURIComponent(recipe.id)}`, { method: 'DELETE' });
    state.recipes = state.recipes.filter((item) => item.id !== recipe.id);
    state.activeId = null;
    elements.deleteDialog.close();
    renderRecipes();
    showToast('Receptlappen är borttagen.');
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.confirmDelete.disabled = false;
    elements.confirmDelete.textContent = 'Ta bort';
  }
});

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => closeDialog(button.dataset.close));
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

let resizeTimer;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    layoutCards();
    filterPreview();
  }, 100);
});

async function initialize() {
  try {
    const { user } = await request('/api/session');
    await showApp(user);
  } catch {
    showLanding();
  }
}

initialize();
