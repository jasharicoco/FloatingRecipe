import { loadEnvFile } from 'node:process';
import { isAbsolute, join, resolve } from 'node:path';

let environmentLoaded = false;

function loadLocalEnvironment() {
  if (environmentLoaded) return;
  environmentLoaded = true;

  try {
    loadEnvFile(resolve(process.cwd(), '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function integerSetting(name, fallback, minimum, maximum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  if (!/^\d+$/.test(rawValue)) throw new Error(`${name} must be an integer.`);

  const value = Number(rawValue);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function loadConfig(rootDirectory) {
  loadLocalEnvironment();

  const environment = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(environment)) {
    throw new Error('NODE_ENV must be development, production, or test.');
  }

  const host = process.env.HOST?.trim() || '127.0.0.1';
  if (/\s|:\/\//.test(host)) throw new Error('HOST must be a hostname or IP address.');

  const configuredDatabasePath = process.env.RECIPE_DB_PATH || join('data', 'recipes.sqlite');
  const databasePath = isAbsolute(configuredDatabasePath)
    ? configuredDatabasePath
    : resolve(rootDirectory, configuredDatabasePath);
  const sessionDays = integerSetting('SESSION_DAYS', 400, 1, 400);

  return Object.freeze({
    databasePath,
    environment,
    host,
    isProduction: environment === 'production',
    maxAccounts: integerSetting('MAX_ACCOUNTS', 250, 1, 100_000),
    maxRecipesPerAccount: integerSetting('MAX_RECIPES_PER_ACCOUNT', 500, 1, 10_000),
    port: integerSetting('PORT', 5171, 1, 65_535),
    sessionLifetimeSeconds: sessionDays * 24 * 60 * 60,
  });
}
