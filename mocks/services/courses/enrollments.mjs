import { randomUUID } from 'node:crypto';
import { json, problem } from '../../lib/http.mjs';
import {
  cohorts,
  enrollments,
  publishStudentEnrolled,
  paginate
} from './store.mjs';

export function registerEnrollments(app) {
  // GET /api/course/enrollments/me
  app.get('/api/course/enrollments/me', (req, res, { identity }) => {
    const studentId = identity?.userId || '30000000-0000-4000-8000-000000000001';
    const myEnrollments = enrollments.filter(e => e.studentId === studentId && e.active);
    const result = myEnrollments.map(e => {
      const cohort = cohorts.find(c => c.id === e.courseCohortId);
      return {
        enrollmentId: e.id,
        cohortId: e.courseCohortId,
        courseBaseName: cohort?.courseBaseName || 'Programación I — Mock',
        courseBaseDescription: cohort?.settings?.description || null,
        cohortStatus: cohort?.status || 'ACTIVE',
        startDate: cohort?.startDate || '2026-03-01',
        endDate: cohort?.endDate || '2026-12-15',
        enrollmentStatus: e.status,
        enrolledDatetime: e.createdAt
      };
    });
    json(res, 200, result);
  });

  // GET /api/course/course-cohorts/:id/enrollments
  app.get('/api/course/course-cohorts/:id/enrollments', (req, res, { params, query }) => {
    let list = enrollments.filter(e => e.courseCohortId === params.id && e.active);
    if (query.status) list = list.filter(e => e.status === query.status);
    json(res, 200, paginate(list, query.page, query.size));
  });

  // POST /api/course/enrollments
  app.post('/api/course/enrollments', async (req, res, { body, identity }) => {
    const cohort = cohorts.find(c => c.invitationCode === body.invitationCode && c.isActive);
    if (!cohort) return problem(res, 404, 'not-found', 'Código de invitación inválido o cohorte inexistente');

    const studentId = identity?.userId || '30000000-0000-4000-8000-000000000002';
    let enrollment = enrollments.find(e => e.courseCohortId === cohort.id && e.studentId === studentId);

    if (enrollment) {
      if (enrollment.status !== 'VALIDATED') {
        enrollment.status = 'VALIDATED';
        await publishStudentEnrolled(enrollment);
      }
      return json(res, 200, enrollment);
    }

    enrollment = {
      id: randomUUID(),
      courseCohortId: cohort.id,
      studentId,
      studentNumber: body.studentNumber || body.legajo || '10002',
      status: 'VALIDATED',
      enrollmentType: 'INVITATION_CODE',
      finalAcademicStatus: null,
      decisionReason: null,
      active: true,
      createdAt: new Date().toISOString()
    };
    enrollments.push(enrollment);
    await publishStudentEnrolled(enrollment);
    json(res, 201, enrollment);
  });

  // POST /api/course/enrollments/:id/approve-exception
  app.post('/api/course/enrollments/:id/approve-exception', async (req, res, { params, body }) => {
    const enrollment = enrollments.find(e => e.id === params.id);
    if (!enrollment) return problem(res, 404, 'not-found', 'Matrícula no encontrada');
    enrollment.status = 'VALIDATED';
    enrollment.decisionReason = body.reason || 'Aprobado por excepción docente';
    await publishStudentEnrolled(enrollment);
    json(res, 200, enrollment);
  });

  // POST /api/course/enrollments/:id/reject
  app.post('/api/course/enrollments/:id/reject', (req, res, { params, body }) => {
    const enrollment = enrollments.find(e => e.id === params.id);
    if (!enrollment) return problem(res, 404, 'not-found', 'Matrícula no encontrada');
    enrollment.status = 'REJECTED';
    enrollment.decisionReason = body.reason || 'Rechazado por docente';
    json(res, 200, enrollment);
  });

  // POST /api/course/mock/course-cohorts/:id/students
  app.post('/api/course/mock/course-cohorts/:id/students', async (req, res, { params, body }) => {
    const cohort = cohorts.find(c => c.id === params.id);
    if (!cohort) return problem(res, 404, 'not-found', 'Cohorte no encontrada');
    if (!body.studentId) return problem(res, 400, 'bad-request', 'studentId es obligatorio');

    const enrollment = {
      id: randomUUID(),
      courseCohortId: cohort.id,
      studentId: body.studentId,
      studentNumber: body.studentNumber || '99999',
      status: 'VALIDATED',
      enrollmentType: 'MANUAL_TEACHER',
      finalAcademicStatus: null,
      decisionReason: 'Matriculación directa mock',
      active: true,
      createdAt: new Date().toISOString()
    };
    enrollments.push(enrollment);
    await publishStudentEnrolled(enrollment);
    json(res, 201, enrollment);
  });
}
