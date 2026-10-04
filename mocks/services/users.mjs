import { randomUUID } from 'node:crypto';
import { createApp, json, problem, noContent, cookies } from '../lib/http.mjs';
import { register } from '../lib/eureka.mjs';

const SERVICE_NAME = 'users-service';
const PORT = process.env.PORT || 8082;
const HOSTNAME = process.env.HOSTNAME || 'users';

const app = createApp(SERVICE_NAME);

// Semilla determinista de usuarios (§3)
function buildSeedUsers() {
  const list = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      firstNames: 'Admin',
      lastNames: 'Inicial',
      legajo: null,
      email: 'admin@utn.edu.ar',
      role: 'ADMIN',
      accountStatus: 'ACTIVE',
      mustChangePassword: false,
      firstLogin: false,
      guidedTourCompleted: true,
      emailVerified: true,
      githubUsername: 'admin-utn',
      avatarRef: null,
      avatarUrl: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      termsAcceptedAt: '2026-09-01T08:05:00.000Z',
      termsVersion: 'v1'
    },
    {
      id: 'c0ffee00-aaaa-4bbb-8ccc-ddddeeeeffff',
      firstNames: 'Gestor',
      lastNames: 'Demo',
      legajo: '80001',
      email: 'gestor@utn.edu.ar',
      role: 'GESTOR',
      accountStatus: 'ACTIVE',
      mustChangePassword: false,
      firstLogin: false,
      guidedTourCompleted: true,
      emailVerified: true,
      githubUsername: 'gestor-utn',
      avatarRef: null,
      avatarUrl: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      termsAcceptedAt: '2026-09-01T08:05:00.000Z',
      termsVersion: 'v1'
    },
    {
      id: '2db91e4f-a408-4b4f-85ec-a68804984cad',
      firstNames: 'Profesor',
      lastNames: 'Demo',
      legajo: '90001',
      email: 'profesor@utn.edu.ar',
      role: 'PROFESSOR',
      accountStatus: 'ACTIVE',
      mustChangePassword: false,
      firstLogin: false,
      guidedTourCompleted: true,
      emailVerified: true,
      githubUsername: 'profesor-utn',
      avatarRef: null,
      avatarUrl: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      termsAcceptedAt: '2026-09-01T08:05:00.000Z',
      termsVersion: 'v1'
    }
  ];

  for (let i = 1; i <= 12; i++) {
    const pad = String(i).padStart(2, '0');
    list.push({
      id: `30000000-0000-4000-8000-0000000000${pad}`,
      firstNames: `Alumno ${pad}`,
      lastNames: 'UTN',
      legajo: `100${pad}`,
      email: `alumno${pad}@frc.utn.edu.ar`,
      role: 'STUDENT',
      accountStatus: 'ACTIVE',
      mustChangePassword: false,
      firstLogin: false,
      guidedTourCompleted: true,
      emailVerified: true,
      githubUsername: `alumno${pad}-dev`,
      avatarRef: null,
      avatarUrl: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      termsAcceptedAt: '2026-09-01T08:05:00.000Z',
      termsVersion: 'v1'
    });
  }

  return list;
}

const users = buildSeedUsers();
const challenges = new Map();

function findUserByEmail(email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  // alumno@frc.utn.edu.ar es alias del alumno 01 (§3)
  if (normalized === 'alumno@frc.utn.edu.ar') {
    return users.find(u => u.id === '30000000-0000-4000-8000-000000000001');
  }
  return users.find(u => u.email.toLowerCase() === normalized) || null;
}

function findUserById(id) {
  return users.find(u => u.id === id) || null;
}

function makeUserToken(user) {
  const payload = {
    type: 'user',
    sub: user.id,
    roles: [user.role]
  };
  return 'mock.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function makeRefreshToken(user) {
  const payload = {
    type: 'refresh',
    sub: user.id
  };
  return 'mock.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function setAuthCookies(res, user) {
  const at = makeUserToken(user);
  const rt = makeRefreshToken(user);
  res.setHeader('Set-Cookie', [
    `fu_at=${at}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`,
    `fu_rt=${rt}; Path=/api/users/public/auth; HttpOnly; SameSite=Lax; Max-Age=604800`
  ]);
}

function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [
    'fu_at=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'fu_rt=; Path=/api/users/public/auth; HttpOnly; SameSite=Lax; Max-Age=0'
  ]);
}

function toMeResponse(user) {
  return {
    id: user.id,
    firstNames: user.firstNames,
    lastNames: user.lastNames,
    legajo: user.legajo || null,
    email: user.email,
    role: user.role,
    accountStatus: 'ACTIVE',
    mustChangePassword: false,
    firstLogin: false,
    guidedTourCompleted: true,
    githubUsername: user.githubUsername || null,
    avatarRef: null,
    avatarUrl: null,
    emailVerified: true,
    createdAt: user.createdAt || '2026-09-01T08:00:00.000Z',
    termsAcceptedAt: user.termsAcceptedAt || '2026-09-01T08:05:00.000Z',
    termsVersion: user.termsVersion || 'v1'
  };
}

// Endpoints base
app.get('/api/users/mock/ping', (req, res) => {
  json(res, 200, { service: SERVICE_NAME, ok: true });
});

app.get('/api/users/mock/echo', (req, res) => {
  json(res, 200, req.headers);
});

// Autenticación pública (§5.4)
app.post('/api/users/public/auth/login', (req, res, { body }) => {
  const email = body?.email;
  const user = findUserByEmail(email);
  if (!user) {
    return problem(res, 401, 'not-authenticated', 'Credenciales inválidas');
  }
  const challengeId = randomUUID();
  challenges.set(challengeId, { userId: user.id, createdAt: Date.now() });
  json(res, 200, {
    challengeId,
    message: 'Credentials accepted. The code is sent by email.'
  });
});

app.post('/api/users/public/auth/2fa/verify', (req, res, { body }) => {
  const challengeId = body?.challengeId;
  const challenge = challengeId ? challenges.get(challengeId) : null;
  if (!challenge) {
    return problem(res, 401, 'invalid-code', 'Desafío 2FA inválido o expirado');
  }
  challenges.delete(challengeId);

  const user = findUserById(challenge.userId);
  if (!user) {
    return problem(res, 401, 'not-authenticated', 'Usuario no encontrado');
  }

  setAuthCookies(res, user);
  json(res, 200, { expiresIn: 3600 });
});

app.post('/api/users/public/auth/refresh', (req, res) => {
  const cookieList = cookies(req);
  const raw = cookieList['fu_rt'] || cookieList['fu_at'];
  if (!raw) {
    return problem(res, 401, 'session-closed', 'Cookie de sesión ausente');
  }

  let userId = null;
  if (raw.startsWith('mock.')) {
    try {
      const b64 = raw.slice(5);
      const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
      userId = parsed.sub;
    } catch {
      // ignore parse error
    }
  }

  const user = userId ? findUserById(userId) : null;
  if (!user) {
    return problem(res, 401, 'session-closed', 'Sesión no válida');
  }

  setAuthCookies(res, user);
  json(res, 200, { expiresIn: 3600 });
});

app.post('/api/users/auth/logout', (req, res) => {
  clearAuthCookies(res);
  noContent(res);
});

// Sesión de usuario (§5.4)
app.get('/api/users/me', (req, res, { identity }) => {
  if (!identity?.userId) {
    return problem(res, 401, 'not-authenticated', 'No autenticado');
  }
  const user = findUserById(identity.userId);
  if (!user) {
    return problem(res, 401, 'not-authenticated', 'Usuario no encontrado');
  }
  json(res, 200, toMeResponse(user));
});

app.patch('/api/users/me/onboarding', (req, res) => {
  noContent(res);
});

// Directorio y perfil público
app.get('/api/users', (req, res) => {
  const list = users.map(u => ({
    id: u.id,
    firstNames: u.firstNames,
    lastNames: u.lastNames,
    legajo: u.legajo || null,
    email: u.email,
    role: u.role,
    accountStatus: 'ACTIVE',
    createdAt: u.createdAt || '2026-09-01T08:00:00.000Z'
  }));
  json(res, 200, list);
});

app.get('/api/users/profile/:id', (req, res, { params, identity }) => {
  const user = findUserById(params.id);
  if (!user) {
    return problem(res, 404, 'not-found', 'Usuario no encontrado');
  }
  const isAdmin = identity?.roles?.includes('ADMIN');
  json(res, 200, {
    id: user.id,
    firstNames: user.firstNames,
    lastNames: user.lastNames,
    githubUsername: user.githubUsername || null,
    avatarRef: null,
    avatarUrl: null,
    email: isAdmin ? user.email : null,
    legajo: isAdmin ? (user.legajo || null) : null,
    accountStatus: isAdmin ? 'ACTIVE' : null
  });
});

app.get('/api/users/public/legal/terms', (req, res) => {
  json(res, 200, {
    version: 'v1',
    texto: 'Términos mock'
  });
});

// Token técnico client_credentials para servicios (Roadmap -> Users)
app.post('/api/users/public/auth/token', (req, res, { body }) => {
  const clientId = body?.clientId || 'service';
  let scopes = [];
  if (typeof body?.scope === 'string') {
    scopes = body.scope.split(' ').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(body?.scopes)) {
    scopes = body.scopes;
  }

  const tokenPayload = {
    type: 'service',
    sub: clientId,
    scopes
  };
  const accessToken = 'mock.' + Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

  json(res, 200, {
    accessToken,
    tokenType: 'bearer',
    expiresIn: 3600
  });
});

// Endpoints mock para panel y testing
app.get('/api/users/mock/users', (req, res) => {
  json(res, 200, users.map(u => ({
    id: u.id,
    email: u.email,
    role: u.role,
    firstNames: u.firstNames,
    lastNames: u.lastNames
  })));
});

app.post('/api/users/mock/users', (req, res, { body }) => {
  const id = body?.id || randomUUID();
  const newUser = {
    id,
    firstNames: body?.firstNames || 'Usuario',
    lastNames: body?.lastNames || 'Mock',
    legajo: body?.legajo || null,
    email: body?.email || `user-${id.slice(0, 8)}@frc.utn.edu.ar`,
    role: body?.role || 'STUDENT',
    accountStatus: 'ACTIVE',
    mustChangePassword: false,
    firstLogin: false,
    guidedTourCompleted: true,
    emailVerified: true,
    githubUsername: body?.githubUsername || null,
    avatarRef: null,
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: 'v1'
  };
  users.push(newUser);
  json(res, 201, newUser);
});

app.post('/api/users/mock/login-as/:id', (req, res, { params }) => {
  const user = findUserById(params.id);
  if (!user) {
    return problem(res, 404, 'not-found', 'Usuario no encontrado');
  }
  setAuthCookies(res, user);
  json(res, 200, toMeResponse(user));
});

app.listen(PORT, async () => {
  console.log(`[${SERVICE_NAME}] Escuchando en puerto ${PORT}`);
  await register(SERVICE_NAME, PORT, HOSTNAME);
});
