import { randomUUID } from 'node:crypto';
import { publish, envelope } from '../../lib/kafka.mjs';

export const SERVICE_NAME = 'course-service';
export const TOPIC_COURSES = 'courses.events';
export const PRODUCER_COURSES = 'tema-02-cursos-matricula';

// IDs fijos semilla (IMPLEMENTACION.md §3)
export const INSTITUTION_ID = '11111111-1111-1111-1111-111111111111';
export const COURSE_BASE_ID = '20000000-0000-4000-8000-000000000001';
export const DEMO_COHORT_ID = '10000000-0000-4000-8000-000000000001';
export const PROFESSOR_ID = '2db91e4f-a408-4b4f-85ec-a68804984cad';
export const GESTOR_ID = 'c0ffee00-aaaa-4bbb-8ccc-ddddeeeeffff';

export const institutions = [
  { id: INSTITUTION_ID, name: 'UTN', description: 'Universidad Tecnológica Nacional', active: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

export const courseBases = [
  { id: COURSE_BASE_ID, institutionId: INSTITUTION_ID, name: 'Programación I', description: 'Curso base de Programación I', active: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

export const cohorts = [
  {
    id: DEMO_COHORT_ID,
    courseBaseId: COURSE_BASE_ID,
    courseBaseName: 'Programación I — Mock',
    status: 'ACTIVE',
    calibrationStatus: 'APPROVED',
    invitationCode: 'PROG1-MOCK',
    startDate: '2026-03-01',
    endDate: '2026-12-15',
    isActive: true,
    courseCohortOriginId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    settings: { description: 'Comisión Mock Demo 2026', color: '#3B82F6', modality: 'HYBRID' }
  }
];

export const cohortProfessors = [
  { id: randomUUID(), courseCohortId: DEMO_COHORT_ID, professorId: PROFESSOR_ID, role: 'PROFESSOR', active: true, createdAt: '2026-03-01T00:00:00.000Z' },
  { id: randomUUID(), courseCohortId: DEMO_COHORT_ID, professorId: GESTOR_ID, role: 'GESTOR', active: true, createdAt: '2026-03-01T00:00:00.000Z' }
];

export const enrollments = [];
for (let i = 1; i <= 12; i++) {
  const pad = String(i).padStart(2, '0');
  enrollments.push({
    id: `e0000000-0000-4000-8000-0000000000${pad}`,
    courseCohortId: DEMO_COHORT_ID,
    studentId: `30000000-0000-4000-8000-0000000000${pad}`,
    studentNumber: `100${pad}`,
    status: 'VALIDATED',
    enrollmentType: 'ROSTER_MATCH',
    finalAcademicStatus: null,
    decisionReason: null,
    active: true,
    createdAt: '2026-03-01T10:00:00.000Z'
  });
}

export const sections = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    courseCohortId: DEMO_COHORT_ID,
    title: 'Unidad 1: Introducción a la Programación',
    description: 'Conceptos iniciales y fundamentos',
    orderIndex: 0,
    isVisible: true,
    isActive: true,
    activeActivityCount: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  }
];

export async function publishStudentEnrolled(enrollment) {
  try {
    const payload = {
      enrollmentId: enrollment.id,
      courseCohortId: enrollment.courseCohortId,
      studentId: enrollment.studentId,
      validationType: enrollment.enrollmentType,
      enrolledAt: enrollment.createdAt
    };
    await publish(TOPIC_COURSES, enrollment.id, envelope('STUDENT_ENROLLED', PRODUCER_COURSES, payload));
  } catch (err) {
    console.error(`[${SERVICE_NAME}] Error al publicar STUDENT_ENROLLED:`, err.message);
  }
}

export async function publishCohortActivated(cohort) {
  try {
    const payload = {
      courseCohortId: cohort.id,
      courseBaseId: cohort.courseBaseId,
      institutionId: INSTITUTION_ID,
      startDate: cohort.startDate,
      endDate: cohort.endDate
    };
    await publish(TOPIC_COURSES, cohort.id, envelope('COURSE_COHORT_ACTIVATED', PRODUCER_COURSES, payload));
  } catch (err) {
    console.error(`[${SERVICE_NAME}] Error al publicar COURSE_COHORT_ACTIVATED:`, err.message);
  }
}

export function paginate(items, pageQuery = '0', sizeQuery = '20') {
  const page = Math.max(0, parseInt(pageQuery, 10) || 0);
  const size = Math.max(1, parseInt(sizeQuery, 10) || 20);
  const totalElements = items.length;
  const totalPages = Math.ceil(totalElements / size) || (totalElements === 0 ? 0 : 1);
  const content = items.slice(page * size, (page + 1) * size);
  return { content, page, size, totalElements, totalPages };
}
