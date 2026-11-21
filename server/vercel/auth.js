import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const names = { flow: '__Host-rota-oauth', session: '__Host-rota-session' };
const cookie = (name, value, age) => name + '=' + value + '; Max-Age=' + age +
  '; Path=/; Secure; HttpOnly; SameSite=Lax';
const random = () => randomBytes(32).toString('base64url');

function cookieValue(request, name) {
  return request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
}

function redirect(path, cookies = []) {
  const headers = new Headers({ Location: path, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function signed(values, type, ttl, config) {
  return new SignJWT(values).setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.origin).setAudience(type).setIssuedAt().setExpirationTime(ttl)
    .sign(config.secret);
}

async function verified(request, type, config) {
  const token = cookieValue(request, names[type]);
  if (!token) return null;
  try {
    return (await jwtVerify(token, config.secret, {
      issuer: config.origin, audience: type, algorithms: ['HS256']
    })).payload;
  } catch {
    return null;
  }
}

export async function sessionFor(request, config) {
  const session = await verified(request, 'session', config);
  if (!session || typeof session.id !== 'string' || typeof session.email !== 'string') return null;
  return session;
}

export function googleIdentity(claims) {
  if (claims.email_verified !== true || typeof claims.email !== 'string' || typeof claims.sub !== 'string') {
    return null;
  }
  const email = claims.email.trim().toLowerCase();
  // Google is authoritative for Gmail and accounts managed by a Google Workspace domain.
  if (!email.endsWith('@gmail.com') && !claims.hd) return null;
  return { id: 'google:' + claims.sub, email };
}

async function start(config) {
  const state = random();
  const nonce = random();
  const verifier = random();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const flow = await signed({ state, nonce, verifier }, 'flow', '10m', config);
  const location = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  location.search = new URLSearchParams({
    client_id: config.googleId, redirect_uri: config.callback, response_type: 'code',
    scope: 'openid email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256'
  });
  return redirect(location.href, [cookie(names.flow, flow, 600)]);
}

async function callback(request, config) {
  const denied = () => redirect('/?login=failed', [cookie(names.flow, '', 0)]);
  const params = new URL(request.url).searchParams;
  const flow = await verified(request, 'flow', config);
  const code = params.get('code');
  if (!flow || !code || params.get('state') !== flow.state) return denied();
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code, client_id: config.googleId, client_secret: config.googleSecret,
        redirect_uri: config.callback, code_verifier: flow.verifier, grant_type: 'authorization_code'
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!tokenResponse.ok) return denied();
    const { id_token } = await tokenResponse.json();
    const { payload } = await jwtVerify(id_token, googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: config.googleId, algorithms: ['RS256']
    });
    if (payload.nonce !== flow.nonce) return denied();
    const identity = googleIdentity(payload);
    if (!identity) return denied();
    const session = await signed(identity, 'session', '8h', config);
    return redirect('/', [cookie(names.flow, '', 0), cookie(names.session, session, 28800)]);
  } catch {
    return denied();
  }
}

export function authRoute(path, request, config) {
  if (path === '/api/auth/login' && request.method === 'GET') return start(config);
  if (path === '/api/auth/callback' && request.method === 'GET') return callback(request, config);
  if (path === '/api/auth/logout' && request.method === 'POST' && request.headers.get('Origin') === config.origin) {
    return redirect('/', [cookie(names.session, '', 0), cookie(names.flow, '', 0)]);
  }
  return new Response('Recurso não encontrado.', { status: 404 });
}
