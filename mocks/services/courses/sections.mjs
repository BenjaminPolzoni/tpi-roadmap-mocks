import { randomUUID } from 'node:crypto';
import { json, problem, noContent } from '../../lib/http.mjs';
import { sections, paginate } from './store.mjs';

export function registerSections(app) {
  app.get('/api/course/course-cohorts/:id/sections', (req, res, { params, query }) => {
    const cohortSections = sections.filter(s => s.courseCohortId === params.id && s.isActive);
    cohortSections.sort((a, b) => a.orderIndex - b.orderIndex);
    json(res, 200, paginate(cohortSections, query.page, query.size || '50'));
  });

  app.post('/api/course/course-cohorts/:id/sections', (req, res, { params, body }) => {
    const maxOrder = sections.filter(s => s.courseCohortId === params.id).reduce((m, s) => Math.max(m, s.orderIndex), -1);
    const section = {
      id: randomUUID(),
      courseCohortId: params.id,
      title: body.title || 'Nueva Sección',
      description: body.description || '',
      orderIndex: body.orderIndex !== undefined ? Number(body.orderIndex) : maxOrder + 1,
      isVisible: body.isVisible !== undefined ? Boolean(body.isVisible) : false,
      isActive: true,
      activeActivityCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    sections.push(section);
    json(res, 201, section);
  });

  app.put('/api/course/course-cohorts/:id/sections/order', (req, res, { params, body }) => {
    const orderList = body.orderedSectionIds || [];
    orderList.forEach((id, idx) => {
      const sec = sections.find(s => s.id === id && s.courseCohortId === params.id);
      if (sec) sec.orderIndex = idx;
    });
    const updated = sections.filter(s => s.courseCohortId === params.id && s.isActive);
    updated.sort((a, b) => a.orderIndex - b.orderIndex);
    json(res, 200, paginate(updated, '0', '50'));
  });

  app.get('/api/course/course-sections/:id', (req, res, { params }) => {
    const section = sections.find(s => s.id === params.id && s.isActive);
    if (!section) return problem(res, 404, 'not-found', 'Sección no encontrada');
    json(res, 200, section);
  });

  app.put('/api/course/course-sections/:id', (req, res, { params, body }) => {
    const section = sections.find(s => s.id === params.id && s.isActive);
    if (!section) return problem(res, 404, 'not-found', 'Sección no encontrada');
    if (body.title !== undefined) section.title = body.title;
    if (body.description !== undefined) section.description = body.description;
    if (body.isVisible !== undefined) section.isVisible = Boolean(body.isVisible);
    section.updatedAt = new Date().toISOString();
    json(res, 200, section);
  });

  app.delete('/api/course/course-sections/:id', (req, res, { params }) => {
    const section = sections.find(s => s.id === params.id && s.isActive);
    if (!section) return problem(res, 404, 'not-found', 'Sección no encontrada');
    section.isActive = false;
    noContent(res);
  });
}
