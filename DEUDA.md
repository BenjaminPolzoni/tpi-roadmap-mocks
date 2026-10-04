# Deuda conocida del mock

> Verificado el 2026-10-03 contra `tpi-roadmap` @ `develop` **1016038** (contrato Kafka v3) y el front @ `develop` **6793198**.
> Cuando se resuelva un ítem, borrarlo de esta lista. Si `develop` de roadmap cambia algo en `clients/`, `events/`, `common/security/` o `application.properties`, volver a verificar el mock (ver el final).

| # | Qué falta | Hoy pasa esto | Cuándo resolverlo | Cómo |
|---|---|---|---|---|
| 1 | **Secciones de Courses en `init-mvp`** | Roadmap tiene `COURSES_SECTIONS_CLIENT_MODE=stub` porque no hay `COURSES_TOKEN_AUDIENCE`/`COURSES_SECTIONS_TOKEN_SCOPE` (pendiente también en el real). `init-mvp` arma el grafo con sus unidades por defecto ("Unidad 1/2") y no con las secciones de la cohorte. | Cuando roadmap tenga audience y scope de Courses confirmados. | Pasar a `http` en el bloque `roadmap` del compose, setear audience y scope, y verificar que `GET /api/course/course-cohorts/{id}/sections` del mock devuelve el `PageResponse` que lee `HttpCourseSectionsClient`. |
| 2 | **`STUDENT_UNENROLLED` y `COURSE_COHORT_ARCHIVED`** | Roadmap los consume (`CoursesLifecycleEventListener`), pero ni el courses real ni el mock los publican. No se pueden probar la baja de un alumno ni el archivado de una cohorte. | Si Courses empieza a publicarlos o si queremos probar esos flujos. | Agregar en el mock de courses dos endpoints bajo `/api/course/mock/...` que publiquen esos eventos en `courses.events` con el envelope v3. |
| 3 | **Inventario y vidas reales (Accounting)** | Roadmap usa `INVENTORY_CLIENT_MODE=stub`: el Gate de elegibilidad y `currentLives` responden siempre 3 vidas deterministas. No se puede probar quedarse sin vidas contra datos reales. | Cuando probemos el Gate, la pantalla de inventario o la pérdida de vidas. | Mock de `accounting-service` con `lives-availability` y `equip-summary` (contratos en `docs/investigacion/01-roadmap-contratos.md` §3.7 y §3.8), más audience y scope, y `INVENTORY_CLIENT_MODE=http`. |
| 4 | **Detalle de nodo y lectura de contenido sin cobertura** | La cohorte demo no tiene nodos `CONTENT`, así que el smoke no prueba `GET …/courses/{id}/nodes/{nodeId}` ni `POST …/nodes/{id}/read`. Esos endpoints responden 409 para nodos que no son contenido; es una regla del propio roadmap. | Próxima vez que se toque `smoke.sh`. | Agregar un paso al smoke que cree un nodo `CONTENT`, lo consulte como alumno y lo marque como leído. |
| 5 | **Pantallas de intento teórico y práctico** | Al iniciar un desafío, el front navega a `/challenges/theoretical/...` o `/practical/...`, que son de otros grupos y no tienen mock, así que esa pantalla falla. El cierre se hace desde el panel. | Cuando queramos el flujo completo del alumno sin usar el panel. | Mocks mínimos de `theoretical-challenge` y `practical-challenge` (student-view y submit) que cierren el intento llamando al simulador del motor. |
| 6 | **Eventos que publica roadmap no visibles** | `NODE_COMPLETED` y `NODE_UNLOCKED` salen a `roadmap.events`, pero solo se ven con `kafka-console-consumer`. | Cuando haga falta depurar desbloqueos seguido. | Que un mock consuma `roadmap.events` y lo muestre en el panel, o sumar `kafka-ui` bajo `profiles: [tools]`. |
| 7 | **Roadmap sin reinicio automático** | Si roadmap falla al arrancar, queda caído (`restart: no`) hasta levantarlo a mano. | Si vuelve a pasar en algún arranque. | Primero entender la causa en `docker compose logs roadmap`; recién después evaluar `restart: on-failure`, que puede esconder bugs. |

## Re-verificación cuando cambia roadmap

1. `git -C ../tpi-roadmap log --oneline <commit verificado>..origin/develop` y mirar si hay cambios en `clients/`, `events/`, `common/security/`, `controllers/` o `application.properties`.
2. `docker compose up -d --build roadmap` y `bash scripts/smoke.sh`.
3. Actualizar el commit de arriba y los `docs/contratos/*.md` que cambien.
