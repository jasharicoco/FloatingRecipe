import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthValidationError,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  validateLogin,
  validateRegistration,
  verifyPassword,
} from './lib/auth.js';
import {
  createRecipeStore,
  RecipeValidationError,
  UserAlreadyExistsError,
} from './lib/database.js';
import { loadConfig } from './lib/config.js';
import { FixedWindowRateLimiter, RateLimitError } from './lib/rate-limit.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const config = loadConfig(root);
const publicDirectory = join(root, 'public');
const store = createRecipeStore(config.databasePath, join(root, 'migrations'));
const sessionCookieName = 'recipe_session';
const registrationLimiter = new FixedWindowRateLimiter({ maximum: 5, windowMs: 60 * 60 * 1000 });
const loginAddressLimiter = new FixedWindowRateLimiter({ maximum: 30, windowMs: 15 * 60 * 1000 });
const loginAccountLimiter = new FixedWindowRateLimiter({ maximum: 10, windowMs: 15 * 60 * 1000 });
const recipeWriteLimiter = new FixedWindowRateLimiter({ maximum: 120, windowMs: 15 * 60 * 1000 });

store.deleteExpiredSessions();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of (request.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function clientAddress(request) {
  const proxyAddress = config.isProduction ? request.headers['x-real-ip'] : null;
  if (typeof proxyAddress === 'string' && proxyAddress.length <= 64) return proxyAddress;
  return request.socket.remoteAddress || 'unknown';
}

function sessionCookie(value, maxAge = config.sessionLifetimeSeconds) {
  const secure = config.isProduction ? '; Secure' : '';
  return `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function requestSession(request) {
  const token = parseCookies(request).get(sessionCookieName);
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const user = store.getUserBySession(tokenHash);
  return user ? { token, tokenHash, user } : null;
}

function requestUser(request) {
  return requestSession(request)?.user || null;
}

function sessionExpiresAt() {
  return new Date(Date.now() + config.sessionLifetimeSeconds * 1000).toISOString();
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host !== request.headers.host) throw new Error();
  } catch {
    throw new AuthValidationError('Förfrågan kunde inte verifieras.');
  }
}

function startSession(response, user, status = 200) {
  const token = createSessionToken();
  store.createSession(hashSessionToken(token), user.id, sessionExpiresAt());
  sendJson(response, status, { user }, { 'Set-Cookie': sessionCookie(token) });
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new RecipeValidationError('Förfrågan är för stor.');
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RecipeValidationError('Ogiltig JSON.');
  }
}

async function handleAuth(request, response, url) {
  if (!url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/session') return false;

  if (request.method === 'GET' && url.pathname === '/api/session') {
    const session = requestSession(request);
    if (!session) {
      sendJson(response, 401, { message: 'Du är inte inloggad.' });
      return true;
    }
    store.refreshSession(session.tokenHash, sessionExpiresAt());
    sendJson(
      response,
      200,
      { user: session.user },
      { 'Set-Cookie': sessionCookie(session.token) },
    );
    return true;
  }

  assertSameOrigin(request);

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    const { name, email, password } = validateRegistration(await readJson(request));
    registrationLimiter.consume(clientAddress(request));
    if (store.findUserForLogin(email)) {
      throw new UserAlreadyExistsError('E-postadressen används redan.');
    }
    if (store.countUsers() >= config.maxAccounts) {
      sendJson(response, 503, { message: 'Appen kan inte ta emot fler konton just nu.' });
      return true;
    }
    const passwordHash = await hashPassword(password);
    const user = store.createUser({ name, email, passwordHash });
    startSession(response, user, 201);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const { email, password } = validateLogin(await readJson(request));
    loginAddressLimiter.consume(clientAddress(request));
    loginAccountLimiter.assertAllowed(email);
    const user = store.findUserForLogin(email);
    if (!user || !await verifyPassword(password, user.passwordHash)) {
      loginAccountLimiter.record(email);
      sendJson(response, 401, { message: 'Fel e-postadress eller lösenord.' });
      return true;
    }
    loginAccountLimiter.reset(email);
    const { passwordHash: _, ...publicUser } = user;
    startSession(response, publicUser);
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = parseCookies(request).get(sessionCookieName);
    if (token) store.deleteSession(hashSessionToken(token));
    response.writeHead(204, { 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' }).end();
    return true;
  }

  sendJson(response, 405, { message: 'Metoden stöds inte.' });
  return true;
}

async function handleApi(request, response, url) {
  const match = url.pathname.match(/^\/api\/recipes(?:\/([^/]+))?$/);
  if (!match) return false;

  const id = match[1] ? decodeURIComponent(match[1]) : null;
  const user = requestUser(request);
  if (!user) {
    sendJson(response, 401, { message: 'Logga in för att se dina recept.' });
    return true;
  }
  if (!['GET', 'HEAD'].includes(request.method)) assertSameOrigin(request);
  if (!['GET', 'HEAD'].includes(request.method)) recipeWriteLimiter.consume(user.id);

  if (request.method === 'GET' && !id) {
    sendJson(response, 200, store.list(user.id));
    return true;
  }
  if (request.method === 'GET' && id) {
    const recipe = store.get(id, user.id);
    sendJson(response, recipe ? 200 : 404, recipe || { message: 'Receptet finns inte.' });
    return true;
  }
  if (request.method === 'POST' && !id) {
    if (store.count(user.id) >= config.maxRecipesPerAccount) {
      sendJson(response, 409, {
        message: `Du kan spara högst ${config.maxRecipesPerAccount} recept.`,
      });
      return true;
    }
    sendJson(response, 201, store.create(await readJson(request), user.id));
    return true;
  }
  if (request.method === 'PUT' && id) {
    const recipe = store.update(id, await readJson(request), user.id);
    sendJson(response, recipe ? 200 : 404, recipe || { message: 'Receptet finns inte.' });
    return true;
  }
  if (request.method === 'DELETE' && id) {
    const removed = store.remove(id, user.id);
    if (!removed) sendJson(response, 404, { message: 'Receptet finns inte.' });
    else response.writeHead(204).end();
    return true;
  }

  sendJson(response, 405, { message: 'Metoden stöds inte.' });
  return true;
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDirectory, safePath);
  if (!filePath.startsWith(publicDirectory) || !existsSync(filePath)) {
    sendJson(response, 404, { message: 'Sidan finns inte.' });
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  response.end(readFileSync(filePath));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (await handleAuth(request, response, url)) return;
    if (await handleApi(request, response, url)) return;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { message: 'Metoden stöds inte.' });
      return;
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    if (error instanceof RecipeValidationError || error instanceof AuthValidationError) {
      sendJson(response, 400, { message: error.message });
      return;
    }
    if (error instanceof UserAlreadyExistsError) {
      sendJson(response, 409, { message: error.message });
      return;
    }
    if (error instanceof RateLimitError) {
      sendJson(response, 429, { message: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { message: 'Något gick fel på servern.' });
  }
});

server.listen(config.port, config.host, () => {
  const displayHost = ['0.0.0.0', '::'].includes(config.host) ? 'localhost' : config.host;
  console.log(`Recipe collection available at http://${displayHost}:${config.port}`);
});

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
