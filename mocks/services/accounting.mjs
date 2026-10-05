import { createApp, json } from '../lib/http.mjs';
import { register } from '../lib/eureka.mjs';

const SERVICE_NAME = 'accounting-service';
const PORT = process.env.PORT || 8098;
const HOSTNAME = process.env.HOSTNAME || 'accounting';

const app = createApp(SERVICE_NAME);

// Vidas por alumno; override via PUT /api/accounting/mock/lives/:studentId {currentLives, reservedLives}
const lives = new Map();
const get = (id) => lives.get(id) ?? { currentLives: 3, reservedLives: 0 };

app.get('/api/accounting/mock/ping', (req, res) => json(res, 200, { service: SERVICE_NAME, ok: true }));

app.get('/api/accounting/courses/:courseId/accounts/:studentId/lives-availability', (req, res, { params }) => {
  json(res, 200, get(params.studentId));
});

app.get('/api/accounting/courses/:courseId/accounts/:studentId/equip-summary', (req, res, { params }) => {
  json(res, 200, { ...get(params.studentId), availableBalance: 250.5, items: [] });
});

app.put('/api/accounting/mock/lives/:studentId', (req, res, { params, body }) => {
  const next = { ...get(params.studentId), ...body };
  lives.set(params.studentId, next);
  json(res, 200, next);
});

app.listen(PORT, async () => {
  console.log(`[${SERVICE_NAME}] Escuchando en puerto ${PORT}`);
  await register(SERVICE_NAME, PORT, HOSTNAME);
});
