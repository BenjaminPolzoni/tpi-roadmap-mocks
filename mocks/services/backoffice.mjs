import { createApp, json, problem } from '../lib/http.mjs';
import { register } from '../lib/eureka.mjs';
import { publish, envelope } from '../lib/kafka.mjs';

const SERVICE_NAME = 'backoffice-service';
const PORT = process.env.PORT || 8100;
const HOSTNAME = process.env.HOSTNAME || 'backoffice';

const app = createApp(SERVICE_NAME);

// Semilla determinista de parámetros globales (§5.6b)
let versionCounter = 1;
const parameters = new Map();

parameters.set('PAR-01', {
  easy: 100,
  medium: 250,
  hard: 500
});

parameters.set('PAR-09', [
  { level: 1, xpRequired: 0 },
  { level: 2, xpRequired: 250 },
  { level: 3, xpRequired: 600 },
  { level: 4, xpRequired: 1000 },
  { level: 5, xpRequired: 1500 }
]);

parameters.set('PAR-12', {
  initialLives: 3,
  maxLives: 5
});

// Endpoints base
app.get('/api/backoffice/mock/ping', (req, res) => {
  json(res, 200, { service: SERVICE_NAME, ok: true });
});

app.get('/api/backoffice/mock/echo', (req, res) => {
  json(res, 200, req.headers);
});

// Catálogo de parámetros PAR (§5.6b)
app.get('/api/backoffice/parameters', (req, res) => {
  const result = Array.from(parameters.entries()).map(([key, value]) => ({
    key,
    value,
    version: String(versionCounter)
  }));
  json(res, 200, result);
});

app.get('/api/backoffice/parameters/:key', (req, res, { params }) => {
  const key = params.key;
  if (!parameters.has(key)) {
    return problem(res, 404, 'not-found', `Parámetro ${key} no encontrado`);
  }
  json(res, 200, {
    key,
    value: parameters.get(key),
    version: String(versionCounter)
  });
});

// Endpoint mock para modificar parámetros y emitir evento de invalidación
app.put('/api/backoffice/mock/parameters/:key', async (req, res, { params, body }) => {
  const key = params.key;
  if (body?.value === undefined) {
    return problem(res, 400, 'validation', 'El campo value es requerido');
  }

  parameters.set(key, body.value);
  versionCounter++;
  const versionStr = String(versionCounter);

  const eventPayload = {
    paramKey: key,
    version: versionStr
  };

  const env = envelope('GLOBAL_CONFIGURATION_CHANGED', SERVICE_NAME, eventPayload);

  try {
    await publish('administration.events', key, env);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] Error publicando evento Kafka: ${err.message}`);
  }

  json(res, 200, {
    ok: true,
    key,
    value: body.value,
    version: versionStr
  });
});

app.listen(PORT, async () => {
  console.log(`[${SERVICE_NAME}] Escuchando en puerto ${PORT}`);
  await register(SERVICE_NAME, PORT, HOSTNAME);
});
