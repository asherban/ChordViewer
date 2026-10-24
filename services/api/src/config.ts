export interface Configuration {
  deployment: 'local' | 'https';
  gatewaySecret?: string;
  databaseUrl: string;
  authSecret: string;
  authBaseUrl: string;
  trustedOrigins: string[];
  host: string;
  port: number;
}

function httpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || value !== url.origin || url.port ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(url.hostname) ||
      /^[0-9.]+$/.test(url.hostname) || /\.(local|localhost|test|invalid|example)$/.test(url.hostname)) {
    throw new Error('HTTPS deployment requires one canonical public HTTPS hostname on port 443.');
  }
  return url.origin;
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
  const deployment = env.DEPLOYMENT_PROFILE ?? 'local';
  if (deployment !== 'local' && deployment !== 'https') throw new Error('Unknown DEPLOYMENT_PROFILE.');
  if (deployment === 'local' && env.LOCAL_DEVELOPMENT !== 'true') throw new Error('Local deployment requires LOCAL_DEVELOPMENT=true.');
  if (deployment === 'https' && (env.LOCAL_DEVELOPMENT !== undefined || env.DEV_API_ORIGIN !== undefined || env.NODE_ENV !== 'production')) {
    throw new Error('HTTPS deployment rejects development settings and requires NODE_ENV=production.');
  }
  if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) throw new Error('Set DATABASE_URL for the local database.');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 64) throw new Error('Set a generated BETTER_AUTH_SECRET of at least 64 characters.');
  if (!env.AUTH_BASE_URL || !env.TRUSTED_ORIGINS) throw new Error('Set AUTH_BASE_URL and TRUSTED_ORIGINS explicitly.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('Unsupported local bind address.');
  if (deployment === 'https') {
    const authBaseUrl = httpsOrigin(env.AUTH_BASE_URL);
    if (env.TRUSTED_ORIGINS !== authBaseUrl) throw new Error('HTTPS deployment trusts only its canonical origin.');
    const gatewaySecret = env.GATEWAY_SECRET;
    if (!gatewaySecret || !/^[a-f0-9]{64}$/.test(gatewaySecret) || gatewaySecret === env.BETTER_AUTH_SECRET) {
      throw new Error('Set an independent generated 32-byte hexadecimal GATEWAY_SECRET.');
    }
    return { deployment, gatewaySecret, databaseUrl: env.DATABASE_URL, authSecret: env.BETTER_AUTH_SECRET,
      authBaseUrl, trustedOrigins: [authBaseUrl], host, port };
  }
  if (env.GATEWAY_SECRET !== undefined) throw new Error('Local deployment must not contain a gateway secret.');
  const lanOrigin = developmentOrigin(env.DEV_API_ORIGIN);
  return {
    deployment,
    databaseUrl: env.DATABASE_URL, authSecret: env.BETTER_AUTH_SECRET,
    authBaseUrl: localOrigin(env.AUTH_BASE_URL, lanOrigin),
    trustedOrigins: [...new Set(env.TRUSTED_ORIGINS.split(',').map(value => localOrigin(value.trim(), lanOrigin)))],
    host, port,
  };
}
