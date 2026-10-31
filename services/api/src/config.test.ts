import { describe, expect, it } from 'vitest';
import { configuration } from './config.js';

const deployed = { NODE_ENV: 'production', DEPLOYMENT_PROFILE: 'https', DATABASE_URL: 'postgresql://runtime:password@database/chordviewer',
  BETTER_AUTH_SECRET: 'a'.repeat(64), GATEWAY_SECRET: 'b'.repeat(64), AUTH_BASE_URL: 'https://chordviewer.app', TRUSTED_ORIGINS: 'https://chordviewer.app' };
describe('deployed configuration', () => {
  it('accepts one canonical HTTPS origin with independent secrets', () => {
    expect(configuration(deployed)).toMatchObject({ deployment: 'https', authBaseUrl: deployed.AUTH_BASE_URL, trustedOrigins: [deployed.AUTH_BASE_URL] });
  });
  it.each(['http://chordviewer.app', 'https://127.0.0.1', 'https://192.168.1.2', 'https://chordviewer.app/', 'https://chordviewer.app:443',
    'https://chordviewer.app:8443', 'https://user:password@chordviewer.app', 'https://chordviewer.app/path', 'https://chordviewer.app?x=y', 'https://api.local', 'https://*.chordviewer.app'])('rejects ambiguous or non-public origins: %s', origin => {
    expect(() => configuration({ ...deployed, AUTH_BASE_URL: origin, TRUSTED_ORIGINS: origin })).toThrow();
  });
  it.each([{ LOCAL_DEVELOPMENT: 'false' }, { DEV_API_ORIGIN: 'http://192.168.1.2' }, { NODE_ENV: 'development' },
    { TRUSTED_ORIGINS: '*' }, { TRUSTED_ORIGINS: 'https://chordviewer.app,https://evil.com' }, { GATEWAY_SECRET: '' },
    { GATEWAY_SECRET: deployed.BETTER_AUTH_SECRET }, { DEPLOYMENT_PROFILE: 'unknown' }])('rejects unsafe or mixed configuration: %j', override => {
    expect(() => configuration({ ...deployed, ...override })).toThrow();
  });
});
