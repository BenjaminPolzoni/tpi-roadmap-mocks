import { randomUUID } from 'node:crypto';
import { createApp, json, problem, noContent } from '../lib/http.mjs';
import { register } from '../lib/eureka.mjs';
import { publish, envelope } from '../lib/kafka.mjs';

const SERVICE_NAME = process.env.SERVICE_NAME || 'engine-challenge-service';
const PORT = process.env.PORT || 8096;
const HOSTNAME = process.env.HOSTNAME || 'challenges';
const TOPIC_CHALLENGES_EVENTS = 'challenges.events';
const PRODUCER_ENGINE = 'THEME-02-CHALLENGE-ENGINE';
const PROFESSOR_ID = '2db91e4f-a408-4b4f-85ec-a68804984cad';
const DEFAULT_STUDENT_ID = '30000000-0000-4000-8000-000000000001';
const DEFAULT_COURSE_ID = '10000000-0000-4000-8000-000000000001';

const INITIAL_CHALLENGES = [
  [1, 'Variables y tipos', 'THEORETICAL', 'BASIC', true],
  [2, 'Estructuras de control', 'PRACTICAL', 'MEDIUM', true],
  [3, 'Mini proyecto', 'PRACTICAL', 'ADVANCED', false],
  [4, 'Recuperación de vida', 'PRACTICAL', 'BASIC', false],
  [5, 'Clases y objetos', 'THEORETICAL', 'MEDIUM', true],
  [6, 'Herencia y polimorfismo', 'THEORETICAL', 'MEDIUM', false],
  [7, 'Modelado de dominio', 'PRACTICAL', 'ADVANCED', true],
  [8, 'Refactor guiado', 'PRACTICAL', 'ADVANCED', false],
  [9, 'Listas y mapas', 'THEORETICAL', 'MEDIUM', true],
  [10, 'Acceso a datos', 'PRACTICAL', 'ADVANCED', true],
  [11, 'Proyecto integrador', 'PRACTICAL', 'ADVANCED', false],
].map(([num, title, type, difficulty, mandatory]) => ({
  id: `40000000-0000-4000-8000-${String(num).padStart(12, '0')}`,
  authorId: PROFESSOR_ID,
  type,
  status: 'PUBLISHED',
  incomplete: false,
  currentVersion: 1,
  title,
  description: `Desafío sobre ${title}`,
  difficulty,
  mandatory,
  retries: 3,
  approvalThreshold: 60,
  contentReference: null,
  createdAt: '2026-09-20T10:00:00Z'
}));

const challenges = new Map(INITIAL_CHALLENGES.map(c => [c.id, { ...c }]));
const attempts = new Map();

function mapDifficulty(d) {
  if (d === 'BASIC' || d === 'EASY') return 'EASY';
  if (d === 'ADVANCED' || d === 'HARD') return 'HARD';
  return 'MEDIUM';
}

function defaultXp(difficulty, approved) {
  if (!approved) return 0;
  const d = mapDifficulty(difficulty);
  return d === 'EASY' ? 100 : (d === 'HARD' ? 500 : 250);
}

function buildClosureEnvelope({
  eventType = 'CHALLENGE_COMPLETED', studentId, courseId, nodeId = null,
  attemptId = randomUUID(), challenge, approved = true, score = null, xp = null,
  reason = 'CANCELLED', detail = null, performedByUserId = null,
  performedByRole = 'STUDENT', eventId = null
}) {
  const isCompleted = eventType === 'CHALLENGE_COMPLETED';
  const difficulty = mapDifficulty(challenge?.difficulty || 'BASIC');
  const calcXp = xp !== null && xp !== undefined ? Math.round(Number(xp)) : (isCompleted ? defaultXp(difficulty, approved) : 0);
  const calcScore = score !== null && score !== undefined ? Math.round(Number(score)) : (isCompleted ? (approved ? 85 : 40) : null);
  const coins = isCompleted && approved ? 100.0 : 0.0;
  const subtractLive = isCompleted ? !approved : false;
  const now = new Date().toISOString();

  let validReason = null;
  if (!isCompleted) {
    const r = String(reason || 'CANCELLED').toUpperCase();
    validReason = ['EXPIRED', 'ABANDONED'].includes(r) ? r : 'CANCELLED';
  }

  const payload = {
    resources: { coins, xp: calcXp, add_live: false, subtract_live: subtractLive, active_item: [] },
    id_user: studentId,
    id_course: courseId,
    id_node: nodeId || null,
    id_attempt: attemptId,
    challenge_id: challenge.id,
    challenge_version: Number(challenge.currentVersion || 1),
    challenge_type: 'NORMAL',
    content_type: challenge.type === 'THEORETICAL' ? 'THEORETICAL' : 'PRACTICAL',
    difficulty,
    mandatory: Boolean(challenge.mandatory),
    performed_by_user_id: performedByUserId || studentId,
    performed_by_role: performedByRole,
    result: {
      status: isCompleted ? (approved ? 'APPROVED' : 'DISAPPROVE') : null,
      score: calcScore,
      completedAt: now,
      late: false,
      attempt_number: 1,
      resolution_time: 120.0,
      startedAt: now,
      submittedAt: isCompleted ? now : null,
      approval_threshold: Number(challenge.approvalThreshold || 60),
      max_attempts: Number(challenge.retries || 3),
      last_attempt: false,
      closure_reason: validReason,
      closure_detail: isCompleted ? null : (detail || 'Cancelado vía simulador')
    }
  };

  const env = envelope(eventType, PRODUCER_ENGINE, payload);
  if (eventId) env.eventId = eventId;
  return env;
}

const app = createApp(SERVICE_NAME);

function route(method, path, handler) {
  app[method](path, handler);
  if (path.startsWith('/api/engine-challenge')) {
    const directPath = path.replace('/api/engine-challenge', '');
    if (directPath) app[method](directPath, handler);
  }
}

route('get', '/api/engine-challenge/mock/ping', (req, res) => json(res, 200, { service: SERVICE_NAME, ok: true }));
route('get', '/api/engine-challenge/mock/echo', (req, res) => json(res, 200, req.headers));

route('get', '/api/engine-challenge/challenges', (req, res, { query }) => {
  let list = Array.from(challenges.values());
  if (query.status && query.status !== 'ALL') list = list.filter(c => c.status === query.status);
  if (query.type && query.type !== 'ALL') list = list.filter(c => c.type === query.type);
  if (query.difficulty && query.difficulty !== 'ALL') list = list.filter(c => c.difficulty === query.difficulty);
  if (query.includeArchived === 'false' && (!query.status || query.status === 'ALL')) list = list.filter(c => c.status !== 'ARCHIVED');

  const page = Math.max(0, parseInt(query.page, 10) || 0);
  const size = Math.max(1, parseInt(query.size, 10) || 50);
  const start = page * size;
  const content = list.slice(start, start + size);

  json(res, 200, {
    content,
    page,
    size,
    totalElements: list.length,
    totalPages: Math.ceil(list.length / size) || 1
  });
});

route('get', '/api/engine-challenge/challenges/:id', (req, res, { params }) => {
  const challenge = challenges.get(params.id);
  if (!challenge) return problem(res, 404, 'not-found', `Desafío ${params.id} no encontrado`);
  json(res, 200, challenge);
});

route('post', '/api/engine-challenge/challenges', (req, res, { body, identity }) => {
  const id = randomUUID();
  const authorId = identity?.userId || PROFESSOR_ID;
  const newChallenge = {
    id, authorId, type: body.type || 'PRACTICAL', status: 'PUBLISHED',
    incomplete: false, currentVersion: 1,
    title: body.title || 'Nuevo desafío', description: body.description || '',
    difficulty: body.difficulty || 'MEDIUM',
    mandatory: body.mandatory !== undefined ? Boolean(body.mandatory) : false,
    retries: body.retries !== undefined ? Number(body.retries) : 3,
    approvalThreshold: body.approvalThreshold !== undefined ? Number(body.approvalThreshold) : 60,
    contentReference: null, createdAt: new Date().toISOString()
  };
  challenges.set(id, newChallenge);
  json(res, 201, newChallenge);
});

route('put', '/api/engine-challenge/challenges/:id', (req, res, { params, body }) => {
  const challenge = challenges.get(params.id);
  if (!challenge) return problem(res, 404, 'not-found', `Desafío ${params.id} no encontrado`);
  ['title', 'description', 'difficulty'].forEach(f => { if (body[f] !== undefined) challenge[f] = body[f]; });
  if (body.mandatory !== undefined) challenge.mandatory = Boolean(body.mandatory);
  if (body.retries !== undefined) challenge.retries = Number(body.retries);
  if (body.approvalThreshold !== undefined) challenge.approvalThreshold = Number(body.approvalThreshold);
  challenge.currentVersion = (challenge.currentVersion || 1) + 1;
  json(res, 200, challenge);
});

route('delete', '/api/engine-challenge/challenges/:id', (req, res, { params }) => {
  const challenge = challenges.get(params.id);
  if (!challenge) return problem(res, 404, 'not-found', `Desafío ${params.id} no encontrado`);
  challenges.delete(params.id);
  noContent(res);
});

function patchStatus(req, res, { params, body }) {
  const challenge = challenges.get(params.id);
  if (!challenge) return problem(res, 404, 'not-found', `Desafío ${params.id} no encontrado`);
  if (body.status) challenge.status = body.status;
  json(res, 200, challenge);
}

route('patch', '/api/engine-challenge/challenges/:id/status', patchStatus);
route('patch', '/api/engine-challenge/challenges/:id/estado', patchStatus);

route('get', '/api/engine-challenge/challenges/:id/versiones', (req, res, { params }) => {
  const challenge = challenges.get(params.id);
  if (!challenge) return problem(res, 404, 'not-found', `Desafío ${params.id} no encontrado`);
  json(res, 200, []);
});

route('post', '/api/engine-challenge/challenges/:id/intentos', (req, res, { params, body, identity }) => {
  const challenge = challenges.get(params.id);
  if (!challenge) return problem(res, 404, 'not-found', `Desafío ${params.id} no encontrado`);
  const attemptId = randomUUID();
  const studentId = identity?.userId || DEFAULT_STUDENT_ID;
  const attempt = {
    attemptId,
    challengeId: challenge.id,
    courseId: body.courseId || DEFAULT_COURSE_ID,
    nodeId: body.nodeId || null,
    studentId,
    attemptType: body.attemptType || 'NORMAL',
    status: 'IN_PROGRESS',
    startedAt: new Date().toISOString()
  };
  attempts.set(attemptId, attempt);
  json(res, 201, { attemptId, challengeId: challenge.id, status: 'IN_PROGRESS' });
});

route('get', '/api/engine-challenge/mock/attempts', (req, res) => {
  json(res, 200, Array.from(attempts.values()));
});

route('post', '/api/engine-challenge/mock/attempts/:attemptId/close', async (req, res, { params, body, identity }) => {
  const attempt = attempts.get(params.attemptId);
  if (!attempt) return problem(res, 404, 'not-found', `Intento ${params.attemptId} no encontrado`);
  const challenge = challenges.get(attempt.challengeId) || {
    id: attempt.challengeId,
    title: 'Desafío',
    type: 'PRACTICAL',
    difficulty: 'MEDIUM',
    mandatory: true,
    currentVersion: 1,
    approvalThreshold: 60,
    retries: 3
  };

  const approved = body.approved !== undefined ? Boolean(body.approved) : true;
  const env = buildClosureEnvelope({
    eventType: 'CHALLENGE_COMPLETED',
    studentId: attempt.studentId,
    courseId: attempt.courseId,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    challenge,
    approved,
    score: body.score,
    xp: body.xp,
    performedByUserId: identity?.userId || attempt.studentId,
    performedByRole: 'STUDENT'
  });

  attempt.status = approved ? 'APPROVED' : 'DISAPPROVE';
  attempt.closedAt = env.timestamp;
  attempt.lastEvent = env;

  await publish(TOPIC_CHALLENGES_EVENTS, attempt.studentId, env);
  json(res, 200, env);
});

route('post', '/api/engine-challenge/mock/attempts/:attemptId/abort', async (req, res, { params, body, identity }) => {
  const attempt = attempts.get(params.attemptId);
  if (!attempt) return problem(res, 404, 'not-found', `Intento ${params.attemptId} no encontrado`);
  const challenge = challenges.get(attempt.challengeId) || {
    id: attempt.challengeId,
    title: 'Desafío',
    type: 'THEORETICAL',
    difficulty: 'BASIC',
    mandatory: false,
    currentVersion: 1,
    approvalThreshold: 60,
    retries: 3
  };

  const reason = body.reason || 'CANCELLED';
  const env = buildClosureEnvelope({
    eventType: 'CHALLENGE_ABORTED',
    studentId: attempt.studentId,
    courseId: attempt.courseId,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    challenge,
    reason,
    detail: body.detail || 'Cancelado vía simulador mock',
    performedByUserId: identity?.userId || PROFESSOR_ID,
    performedByRole: identity?.roles?.includes('ADMIN') ? 'ADMIN' : 'PROFESSOR'
  });

  attempt.status = 'ABORTED';
  attempt.closedAt = env.timestamp;
  attempt.lastEvent = env;

  await publish(TOPIC_CHALLENGES_EVENTS, attempt.studentId, env);
  json(res, 200, env);
});

route('post', '/api/engine-challenge/mock/close', async (req, res, { body, identity }) => {
  const studentId = body.studentId || DEFAULT_STUDENT_ID;
  const courseId = body.courseId || DEFAULT_COURSE_ID;
  const challengeId = body.challengeId || '40000000-0000-4000-8000-000000000001';
  const nodeId = body.nodeId || null;
  const approved = body.approved !== undefined ? Boolean(body.approved) : true;

  const challenge = challenges.get(challengeId) || {
    id: challengeId,
    title: 'Desafío',
    type: 'THEORETICAL',
    difficulty: 'BASIC',
    mandatory: true,
    currentVersion: 1,
    approvalThreshold: 60,
    retries: 3
  };

  const env = buildClosureEnvelope({
    eventType: 'CHALLENGE_COMPLETED',
    studentId,
    courseId,
    nodeId,
    attemptId: body.attemptId || randomUUID(),
    challenge,
    approved,
    score: body.score,
    xp: body.xp,
    performedByUserId: identity?.userId || studentId,
    performedByRole: 'STUDENT',
    eventId: body.eventId || null
  });

  await publish(TOPIC_CHALLENGES_EVENTS, studentId, env);
  json(res, 200, env);
});

app.listen(PORT, async () => {
  console.log(`[${SERVICE_NAME}] Escuchando en puerto ${PORT}`);
  await register(SERVICE_NAME, PORT, HOSTNAME);
});
