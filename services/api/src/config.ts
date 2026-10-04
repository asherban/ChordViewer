export interface Configuration {
  databaseUrl: string;
  authSecret: string;
  authBaseUrl: string;
  trustedOrigins: string[];
  host: string;
  port: number;
}

function developmentOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  const octets = url.hostname.split('.').map(Number);
  const privateIp = octets.length === 4 && octets.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (octets[0] === 10 || octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31 || octets[0] === 192 && octets[1] === 168);
  if (!privateIp || url.protocol !== 'http:' || value !== url.origin) {
    throw new Error('DEV_API_ORIGIN must be an explicit HTTP origin at a private IPv4 address.');
  }
  return value;
}

function localOrigin(value: string, lanOrigin?: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.origin !== lanOrigin) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Local deployment accepts only loopback origins and the explicitly configured DEV_API_ORIGIN.');
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
  const lanOrigin = developmentOrigin(env.DEV_API_ORIGIN);
  return {
    databaseUrl: env.DATABASE_URL, authSecret: env.BETTER_AUTH_SECRET,
    authBaseUrl: localOrigin(env.AUTH_BASE_URL, lanOrigin),
    trustedOrigins: [...new Set(env.TRUSTED_ORIGINS.split(',').map(value => localOrigin(value.trim(), lanOrigin)))],
    host, port,
  };
}
