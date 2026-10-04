import { createApp, json } from '../lib/http.mjs';
import { register } from '../lib/eureka.mjs';
import {
  SERVICE_NAME,
  institutions,
  courseBases,
  cohorts,
  cohortProfessors,
  enrollments,
  sections,
  publishStudentEnrolled
} from './courses/store.mjs';
import { registerCohorts } from './courses/cohorts.mjs';
import { registerSections } from './courses/sections.mjs';
import { registerEnrollments } from './courses/enrollments.mjs';

const PORT = process.env.PORT || 8086;
const HOSTNAME = process.env.HOSTNAME || 'courses';

const app = createApp(SERVICE_NAME);

// Endpoints base para verificación y panel
app.get('/api/course/mock/ping', (req, res) => {
  json(res, 200, { service: SERVICE_NAME, ok: true });
});

app.get('/api/course/mock/echo', (req, res) => {
  json(res, 200, req.headers);
});

app.get('/api/course/mock/state', (req, res) => {
  json(res, 200, { institutions, courseBases, cohorts, cohortProfessors, enrollments, sections });
});

// Registrar rutas por recurso (R9 IMPLEMENTACION.md)
registerCohorts(app);
registerSections(app);
registerEnrollments(app);

// Arranque y republicación condicional de eventos sembrados
app.listen(PORT, async () => {
  console.log(`[${SERVICE_NAME}] Escuchando en puerto ${PORT}`);
  await register(SERVICE_NAME, PORT, HOSTNAME);

  const publishSeed = process.env.PUBLISH_SEED_ENROLLMENTS === 'true';
  if (publishSeed) {
    console.log(`[${SERVICE_NAME}] PUBLISH_SEED_ENROLLMENTS=true: republicando STUDENT_ENROLLED de las 12 matrículas sembradas...`);
    for (const enrollment of enrollments) {
      await publishStudentEnrolled(enrollment);
    }
    console.log(`[${SERVICE_NAME}] Matrículas sembradas republicadas con éxito.`);
  } else {
    console.log(`[${SERVICE_NAME}] PUBLISH_SEED_ENROLLMENTS=false: no se republican matrículas sembradas al arrancar.`);
  }
});
