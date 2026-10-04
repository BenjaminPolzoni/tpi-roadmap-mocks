import { randomUUID } from 'node:crypto';
import { json, problem, noContent } from '../../lib/http.mjs';
import {
  INSTITUTION_ID,
  PROFESSOR_ID,
  GESTOR_ID,
  institutions,
  courseBases,
  cohorts,
  cohortProfessors,
  enrollments,
  publishCohortActivated,
  paginate
} from './store.mjs';

export function registerCohorts(app) {
  // Institución y cursos base
  app.get('/api/course/institution', (req, res) => json(res, 200, institutions[0]));

  app.get('/api/course/course-base/institution/:id', (req, res, { params }) => {
    const list = courseBases.filter(cb => cb.institutionId === params.id && cb.active);
    json(res, 200, list.length > 0 ? list : courseBases);
  });

  app.post('/api/course/course-base', (req, res, { body }) => {
    if (!body.name) return problem(res, 400, 'bad-request', 'El nombre del curso base es obligatorio');
    const base = {
      id: randomUUID(),
      institutionId: body.institutionId || INSTITUTION_ID,
      name: body.name,
      description: body.description || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    courseBases.push(base);
    json(res, 201, base);
  });

  // GET /api/course/course-cohorts/me (rol-aware)
  app.get('/api/course/course-cohorts/me', (req, res, { query, identity }) => {
    const roles = identity?.roles || [];
    const userId = identity?.userId;
    const isStudent = roles.includes('STUDENT') || (userId && userId.startsWith('30000000'));
    const isProfessor = roles.includes('PROFESSOR') || userId === PROFESSOR_ID;
    const isGestor = roles.includes('GESTOR') || userId === GESTOR_ID;
    const isAdmin = roles.includes('ADMIN');

    let items = [];
    if (isStudent && !isProfessor && !isGestor && !isAdmin) {
      const enrolledCohortIds = new Set(
        enrollments.filter(e => e.studentId === userId && e.status === 'VALIDATED' && e.active).map(e => e.courseCohortId)
      );
      let myCohorts = cohorts.filter(c => enrolledCohortIds.has(c.id));
      if (query.status && query.status !== 'ALL') myCohorts = myCohorts.filter(c => c.status === query.status);
      // Alumno: sin professorRole, settings ni invitationCode
      items = myCohorts.map(c => ({ id: c.id, courseBaseName: c.courseBaseName, status: c.status, startDate: c.startDate, endDate: c.endDate }));
    } else if (isAdmin) {
      let myCohorts = [...cohorts];
      if (query.status && query.status !== 'ALL') myCohorts = myCohorts.filter(c => c.status === query.status);
      items = myCohorts.map(c => ({ id: c.id, courseBaseName: c.courseBaseName, status: c.status, startDate: c.startDate, endDate: c.endDate, professorRole: 'GESTOR', invitationCode: c.invitationCode, settings: c.settings }));
    } else {
      const assignments = cohortProfessors.filter(p => p.professorId === userId && p.active);
      const assignMap = new Map(assignments.map(a => [a.courseCohortId, a.role]));
      let myCohorts = cohorts.filter(c => assignMap.has(c.id));
      if (query.status && query.status !== 'ALL') myCohorts = myCohorts.filter(c => c.status === query.status);
      const defaultRole = isGestor ? 'GESTOR' : 'PROFESSOR';
      items = myCohorts.map(c => ({ id: c.id, courseBaseName: c.courseBaseName, status: c.status, startDate: c.startDate, endDate: c.endDate, professorRole: assignMap.get(c.id) || defaultRole, invitationCode: c.invitationCode, settings: c.settings }));
    }
    json(res, 200, paginate(items, query.page, query.size));
  });

  // GET /api/course/course-cohorts/:id/membership
  app.get('/api/course/course-cohorts/:id/membership', (req, res, { params, identity }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');

    const roles = identity?.roles || [];
    const userId = identity?.userId;
    let role = 'STUDENT';
    let canWrite = false;

    if (userId) {
      const prof = cohortProfessors.find(p => p.courseCohortId === cohort.id && p.professorId === userId && p.active);
      if (prof) {
        role = prof.role;
        canWrite = role !== 'PROFESSOR_READ_ONLY';
      } else if (roles.includes('GESTOR') || roles.includes('ADMIN')) {
        role = 'GESTOR'; canWrite = true;
      } else if (roles.includes('PROFESSOR')) {
        role = 'PROFESSOR'; canWrite = true;
      } else if (roles.includes('STUDENT') || userId.startsWith('30000000')) {
        role = 'STUDENT'; canWrite = false;
      }
    } else if (roles.includes('GESTOR') || roles.includes('ADMIN')) {
      role = 'GESTOR'; canWrite = true;
    } else if (roles.includes('PROFESSOR')) {
      role = 'PROFESSOR'; canWrite = true;
    }

    json(res, 200, { courseCohortId: cohort.id, role, canRead: true, canWrite });
  });

  // POST /api/course/course-cohorts
  app.post('/api/course/course-cohorts', async (req, res, { body, identity }) => {
    if (!body.courseBaseId || !body.startDate || !body.endDate) {
      return problem(res, 400, 'bad-request', 'Faltan campos obligatorios (courseBaseId, startDate, endDate)');
    }
    const base = courseBases.find(cb => cb.id === body.courseBaseId);
    const code = 'PROG-' + randomUUID().substring(0, 6).toUpperCase();

    const cohort = {
      id: randomUUID(),
      courseBaseId: body.courseBaseId,
      courseBaseName: base ? base.name : 'Curso Nuevo',
      status: 'ACTIVE',
      calibrationStatus: 'APPROVED',
      invitationCode: code,
      startDate: body.startDate,
      endDate: body.endDate,
      isActive: true,
      courseCohortOriginId: null,
      createdAt: new Date().toISOString(),
      settings: body.settings || { modality: 'HYBRID', color: '#10B981' }
    };
    cohorts.push(cohort);

    const creatorId = identity?.userId || body.professorId || PROFESSOR_ID;
    const creatorRole = identity?.roles?.includes('GESTOR') ? 'GESTOR' : 'PROFESSOR';
    cohortProfessors.push({ id: randomUUID(), courseCohortId: cohort.id, professorId: creatorId, role: creatorRole, active: true, createdAt: new Date().toISOString() });

    if (body.professorId && body.professorId !== creatorId) {
      cohortProfessors.push({ id: randomUUID(), courseCohortId: cohort.id, professorId: body.professorId, role: 'PROFESSOR', active: true, createdAt: new Date().toISOString() });
    }

    await publishCohortActivated(cohort);
    json(res, 201, {
      id: cohort.id,
      courseBaseId: cohort.courseBaseId,
      courseBaseName: cohort.courseBaseName,
      status: cohort.status,
      invitationCode: cohort.invitationCode,
      isActive: cohort.isActive,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      createdAt: cohort.createdAt,
      settings: cohort.settings
    });
  });

  // GET /api/course/course-cohorts/:id
  app.get('/api/course/course-cohorts/:id', (req, res, { params, identity }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');
    const assignment = cohortProfessors.find(p => p.courseCohortId === cohort.id && p.professorId === identity?.userId && p.active);
    const professorRole = assignment?.role || (identity?.roles?.includes('PROFESSOR') ? 'PROFESSOR' : (identity?.roles?.includes('GESTOR') ? 'GESTOR' : undefined));

    json(res, 200, {
      id: cohort.id,
      courseBaseId: cohort.courseBaseId,
      courseBaseName: cohort.courseBaseName,
      status: cohort.status,
      invitationCode: cohort.invitationCode,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      isActive: cohort.isActive,
      courseCohortOriginId: cohort.courseCohortOriginId,
      createdAt: cohort.createdAt,
      professorRole,
      settings: cohort.settings
    });
  });

  app.patch('/api/course/course-cohorts/:id', (req, res, { params, body }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');
    if (body.startDate) cohort.startDate = body.startDate;
    if (body.endDate) cohort.endDate = body.endDate;
    if (body.settings) cohort.settings = { ...cohort.settings, ...body.settings };
    json(res, 200, cohort);
  });

  app.patch('/api/course/course-cohorts/:id/activate', async (req, res, { params }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');
    cohort.status = 'ACTIVE';
    cohort.isActive = true;
    if (!cohort.invitationCode) cohort.invitationCode = 'PROG-' + randomUUID().substring(0, 6).toUpperCase();
    await publishCohortActivated(cohort);
    json(res, 200, cohort);
  });

  app.patch('/api/course/course-cohorts/:id/deactivate', (req, res, { params }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');
    cohort.status = 'ARCHIVED';
    cohort.isActive = false;
    noContent(res);
  });

  app.post('/api/course/course-cohorts/:id/invitation-code', (req, res, { params }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');
    cohort.invitationCode = 'PROG-' + randomUUID().substring(0, 6).toUpperCase();
    json(res, 200, cohort);
  });

  // Profesores y padrón
  app.get('/api/course/course-cohorts/:id/professors', (req, res, { params, query }) => {
    const profs = cohortProfessors.filter(p => p.courseCohortId === params.id && p.active);
    json(res, 200, paginate(profs, query.page, query.size || '20'));
  });

  app.post('/api/course/course-cohorts/:id/professors', (req, res, { params, body }) => {
    const assignment = {
      id: randomUUID(),
      courseCohortId: params.id,
      professorId: body.professorId,
      role: body.professorRole || body.role || 'PROFESSOR',
      active: true,
      createdAt: new Date().toISOString()
    };
    cohortProfessors.push(assignment);
    json(res, 201, assignment);
  });

  app.get('/api/course/course-cohorts/:id/students', (req, res, { params, query }) => {
    const list = enrollments
      .filter(e => e.courseCohortId === params.id && e.status === 'VALIDATED')
      .map(e => ({ studentNumber: e.studentNumber, firstName: 'Estudiante', lastName: e.studentNumber, institutionalEmail: `alumno${e.studentNumber.slice(-2)}@frc.utn.edu.ar` }));
    json(res, 200, paginate(list, query.page, query.size || '20'));
  });

  app.get('/api/course/course-cohorts/:id/student-roster', (req, res, { params }) => {
    const rows = ['student_number,institutional_email,first_name,last_name'];
    enrollments
      .filter(e => e.courseCohortId === params.id && e.status === 'VALIDATED')
      .forEach(e => {
        rows.push(`${e.studentNumber},alumno${e.studentNumber.slice(-2)}@frc.utn.edu.ar,Estudiante,${e.studentNumber}`);
      });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.end(rows.join('\n'));
  });
}
