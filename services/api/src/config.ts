export interface Configuration {
  databaseUrl: string;
  authSecret: string;
  authBaseUrl: string;
  trustedOrigins: string[];
  host: string;
  port: number;
}

function localOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('M3 accepts only explicit HTTP loopback origins.');
  }
  return url.origin;
}

export function configuration(env: NodeJS.ProcessEnv = process.env): Configuration {
  // Containers use NODE_ENV=production, but this deployment is intentionally workstation-only.
  if (env.LOCAL_DEVELOPMENT !== 'true') throw new Error('M3 requires LOCAL_DEVELOPMENT=true. Public deployment is not configured.');
  if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) throw new Error('Set DATABASE_URL for the local database.');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 64) throw new Error('Set a generated BETTER_AUTH_SECRET of at least 64 characters.');
  if (!env.AUTH_BASE_URL || !env.TRUSTED_ORIGINS) throw new Error('Set AUTH_BASE_URL and TRUSTED_ORIGINS explicitly.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('Unsupported local bind address.');
  return {
    databaseUrl: env.DATABASE_URL, authSecret: env.BETTER_AUTH_SECRET,
    authBaseUrl: localOrigin(env.AUTH_BASE_URL),
    trustedOrigins: [...new Set(env.TRUSTED_ORIGINS.split(',').map(value => localOrigin(value.trim())))],
    host, port,
  };
}
