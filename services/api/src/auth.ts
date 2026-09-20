import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import type { Pool } from 'pg';
import type { Configuration } from './config.js';

export function createAuth(pool: Pool, config: Configuration) {
  return betterAuth({
    appName: 'ChordViewer', baseURL: config.authBaseUrl, basePath: '/api/auth',
    secret: config.authSecret, database: pool,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: false },
    session: { expiresIn: 86_400, updateAge: 3_600, cookieCache: { enabled: false } },
    plugins: [bearer({ requireSignature: true })],
    advanced: {
      useSecureCookies: false, // configuration() refuses non-loopback deployment; HTTPS is a later milestone.
      cookiePrefix: 'chordviewer', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['x-chordviewer-client-ip'] },
    },
    rateLimit: {
      enabled: true, storage: 'database', window: 60, max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 20 }, '/sign-up/email': { window: 60, max: 20 } },
    },
    // No error payloads or credentials should enter container logs.
    logger: { disabled: true },
  });
}
