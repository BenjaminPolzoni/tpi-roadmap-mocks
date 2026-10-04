#!/usr/bin/env bash
set -e

# scripts/smoke.sh — Smoke test de integración E2E de tpi-roadmap-mocks con roadmap real
# Escenario de aceptación §6 (pasos 1 a 9)

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
RAND=$(date +%s)
COOKIES_PROF=$(mktemp)
COOKIES_STUDENT=$(mktemp)

cleanup() {
  rm -f "$COOKIES_PROF" "$COOKIES_STUDENT"
}
trap cleanup EXIT

echo "=== INICIANDO SMOKE TEST (run $RAND) ==="

# ---------------------------------------------------------------------------
# Paso 1: Servicios UP en /_mock/registry y ping de roadmap respondiendo
# ---------------------------------------------------------------------------
echo "--- Paso 1: Verificando registro en Eureka y ping a roadmap..."
REGISTRY_OK=0
for i in $(seq 1 90); do
  REGISTRY_DATA=$(curl -s "$GATEWAY_URL/_mock/registry" || true)
  if echo "$REGISTRY_DATA" | grep -q "USERS-SERVICE" && \
     echo "$REGISTRY_DATA" | grep -q "COURSE-SERVICE" && \
     echo "$REGISTRY_DATA" | grep -q "ENGINE-CHALLENGE-SERVICE" && \
     echo "$REGISTRY_DATA" | grep -q "BACKOFFICE-SERVICE" && \
     echo "$REGISTRY_DATA" | grep -q "ROADMAP-SERVICE"; then
    PING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/api/roadmap/public/ping" || true)
    if [ "$PING_STATUS" = "200" ]; then
      REGISTRY_OK=1
      break
    fi
  fi
  sleep 2
done

if [ "$REGISTRY_OK" -ne 1 ]; then
  echo "FALLO paso 1: Servicios no quedaron UP en Eureka o ping no respondio 200 en 180s"
  exit 1
fi
echo "OK paso 1: USERS, COURSE, ENGINE-CHALLENGE, BACKOFFICE y ROADMAP-SERVICE estan UP y ping responde 200"

# ---------------------------------------------------------------------------
# Paso 2: Login del profesor (login + verify) y validación de /me
# ---------------------------------------------------------------------------
echo "--- Paso 2: Autenticando profesor..."
PROF_LOGIN_RES=$(curl -s -X POST "$GATEWAY_URL/api/users/public/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"profesor@utn.edu.ar","password":"mock"}')
PROF_CHALLENGE_ID=$(echo "$PROF_LOGIN_RES" | grep -o '"challengeId":"[^"]*"' | head -n 1 | sed 's/"challengeId":"//;s/"//')

if [ -z "$PROF_CHALLENGE_ID" ]; then
  echo "FALLO paso 2: No se obtuvo challengeId en login de profesor: $PROF_LOGIN_RES"
  exit 1
fi

curl -s -c "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/users/public/auth/2fa/verify" \
  -H "Content-Type: application/json" \
  -d "{\"challengeId\":\"$PROF_CHALLENGE_ID\",\"code\":\"123456\"}" > /dev/null

ME_RES=$(curl -s -b "$COOKIES_PROF" "$GATEWAY_URL/api/users/me")
if echo "$ME_RES" | grep -q "2db91e4f-a408-4b4f-85ec-a68804984cad" && echo "$ME_RES" | grep -q "PROFESSOR"; then
  echo "OK paso 2: Login del profesor completado y /me devuelve el profesor (2db91e4f-a408-4b4f-85ec-a68804984cad)"
else
  echo "FALLO paso 2: /me no devolvio los datos esperados del profesor: $ME_RES"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paso 3: El profesor crea cohorte "Smoke" y desafíos D1 (BASIC) y D2 (MEDIUM)
# ---------------------------------------------------------------------------
echo "--- Paso 3: Creando cohorte Smoke y desafíos D1 y D2..."
CREATE_COHORT_RES=$(curl -s -b "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/course/course-cohorts" \
  -H "Content-Type: application/json" \
  -d '{"courseBaseId":"20000000-0000-4000-8000-000000000001","startDate":"2026-03-01","endDate":"2026-12-15","settings":{"description":"Smoke"}}')
COHORT_ID=$(echo "$CREATE_COHORT_RES" | grep -o '"id":"[^"]*"' | head -n 1 | sed 's/"id":"//;s/"//')

if [ -z "$COHORT_ID" ]; then
  echo "FALLO paso 3: Error al crear cohorte Smoke: $CREATE_COHORT_RES"
  exit 1
fi

CREATE_D1_RES=$(curl -s -b "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/engine-challenge/challenges" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke D1 $RAND\",\"type\":\"THEORETICAL\",\"difficulty\":\"BASIC\",\"mandatory\":true}")
D1_ID=$(echo "$CREATE_D1_RES" | grep -o '"id":"[^"]*"' | head -n 1 | sed 's/"id":"//;s/"//')

CREATE_D2_RES=$(curl -s -b "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/engine-challenge/challenges" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke D2 $RAND\",\"type\":\"PRACTICAL\",\"difficulty\":\"MEDIUM\",\"mandatory\":true}")
D2_ID=$(echo "$CREATE_D2_RES" | grep -o '"id":"[^"]*"' | head -n 1 | sed 's/"id":"//;s/"//')

if [ -z "$D1_ID" ] || [ -z "$D2_ID" ]; then
  echo "FALLO paso 3: Error al crear desafios: D1=$CREATE_D1_RES D2=$CREATE_D2_RES"
  exit 1
fi
echo "OK paso 3: Cohorte Smoke ($COHORT_ID) y desafios D1 ($D1_ID, BASIC) y D2 ($D2_ID, MEDIUM) creados"

# ---------------------------------------------------------------------------
# Paso 4: En roadmap crea sección, nodos N1 (D1) y N2 (D2), y regla ALL [N1] en N2
# ---------------------------------------------------------------------------
echo "--- Paso 4: Configurando roadmap: seccion, nodos N1/N2 y regla ALL [N1]..."
CREATE_SEC_RES=$(curl -s -b "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/roadmap/courses/$COHORT_ID/sections" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Seccion Smoke $RAND\",\"sortOrder\":1}")
SECTION_ID=$(echo "$CREATE_SEC_RES" | grep -o '"id":"[^"]*"' | head -n 1 | sed 's/"id":"//;s/"//')

if [ -z "$SECTION_ID" ]; then
  echo "FALLO paso 4: Error al crear seccion en roadmap: $CREATE_SEC_RES"
  exit 1
fi

CREATE_N1_RES=$(curl -s -b "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/roadmap/sections/$SECTION_ID/nodes" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"THEORETICAL_CHALLENGE\",\"name\":\"Nodo D1 $RAND\",\"sortOrder\":1,\"challengeId\":\"$D1_ID\",\"mandatory\":true}")
N1_ID=$(echo "$CREATE_N1_RES" | grep -o '"id":"[^"]*"' | head -n 1 | sed 's/"id":"//;s/"//')

CREATE_N2_RES=$(curl -s -b "$COOKIES_PROF" -X POST "$GATEWAY_URL/api/roadmap/sections/$SECTION_ID/nodes" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"PRACTICAL_CHALLENGE\",\"name\":\"Nodo D2 $RAND\",\"sortOrder\":2,\"challengeId\":\"$D2_ID\",\"mandatory\":true}")
N2_ID=$(echo "$CREATE_N2_RES" | grep -o '"id":"[^"]*"' | head -n 1 | sed 's/"id":"//;s/"//')

if [ -z "$N1_ID" ] || [ -z "$N2_ID" ]; then
  echo "FALLO paso 4: Error al crear nodos: N1=$CREATE_N1_RES N2=$CREATE_N2_RES"
  exit 1
fi

RULES_RES=$(curl -s -b "$COOKIES_PROF" -X PATCH "$GATEWAY_URL/api/roadmap/nodes/$N2_ID/rules" \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"AND\",\"prerequisiteNodeIds\":[\"$N1_ID\"]}")

if echo "$RULES_RES" | grep -q '"mode":"AND"' && echo "$RULES_RES" | grep -q "$N1_ID"; then
  echo "OK paso 4: Seccion ($SECTION_ID), N1 ($N1_ID), N2 ($N2_ID) y regla ALL [N1] creados exitosamente"
else
  echo "FALLO paso 4: No se pudo configurar la regla ALL [N1] en N2: $RULES_RES"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paso 5: Matricula al alumno 02 por el endpoint mock
# ---------------------------------------------------------------------------
echo "--- Paso 5: Matriculando alumno 02 por endpoint mock..."
STUDENT_ID="30000000-0000-4000-8000-000000000002"
ENROLL_RES=$(curl -s -X POST "$GATEWAY_URL/api/course/mock/course-cohorts/$COHORT_ID/students" \
  -H "Content-Type: application/json" \
  -d "{\"studentId\":\"$STUDENT_ID\"}")

if echo "$ENROLL_RES" | grep -q "VALIDATED"; then
  echo "OK paso 5: Alumno 02 matriculado por endpoint mock (evento STUDENT_ENROLLED emitido)"
else
  echo "FALLO paso 5: Error al matricular alumno 02: $ENROLL_RES"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paso 6: Progreso del alumno 02 muestra N1 enabled y N2 locked (asíncrono Kafka)
# ---------------------------------------------------------------------------
echo "--- Paso 6: Autenticando alumno 02 y verificando progreso inicial (reintento hasta 15s)..."
ST_LOGIN_RES=$(curl -s -X POST "$GATEWAY_URL/api/users/public/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alumno02@frc.utn.edu.ar","password":"mock"}')
ST_CHALLENGE_ID=$(echo "$ST_LOGIN_RES" | grep -o '"challengeId":"[^"]*"' | head -n 1 | sed 's/"challengeId":"//;s/"//')

curl -s -c "$COOKIES_STUDENT" -X POST "$GATEWAY_URL/api/users/public/auth/2fa/verify" \
  -H "Content-Type: application/json" \
  -d "{\"challengeId\":\"$ST_CHALLENGE_ID\",\"code\":\"123456\"}" > /dev/null

PASO6_OK=0
for i in $(seq 1 15); do
  PROG_RES=$(curl -s -b "$COOKIES_STUDENT" "$GATEWAY_URL/api/roadmap/courses/$COHORT_ID/students/$STUDENT_ID/progress" || true)
  if echo "$PROG_RES" | grep -F "\"nodeId\":\"$N1_ID\",\"status\":\"enabled\"" > /dev/null && \
     echo "$PROG_RES" | grep -F "\"nodeId\":\"$N2_ID\",\"status\":\"locked\"" > /dev/null; then
    PASO6_OK=1
    break
  fi
  sleep 1
done

if [ "$PASO6_OK" -eq 1 ]; then
  echo "OK paso 6: Con cookie de alumno 02, progreso muestra N1 enabled y N2 locked"
else
  echo "FALLO paso 6: N1 enabled y N2 locked no se observaron en 15s. Ultimo progreso: $PROG_RES"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paso 7: Cierra D1 desaprobado: XP no cambia y N2 sigue locked
# ---------------------------------------------------------------------------
echo "--- Paso 7: Cerrando D1 desaprobado y verificando XP y estado bloqueado..."
curl -s -X POST "$GATEWAY_URL/api/engine-challenge/mock/close" \
  -H "Content-Type: application/json" \
  -d "{\"studentId\":\"$STUDENT_ID\",\"courseId\":\"$COHORT_ID\",\"challengeId\":\"$D1_ID\",\"nodeId\":\"$N1_ID\",\"approved\":false}" > /dev/null

PASO7_OK=0
for i in $(seq 1 15); do
  PROG_RES=$(curl -s -b "$COOKIES_STUDENT" "$GATEWAY_URL/api/roadmap/courses/$COHORT_ID/students/$STUDENT_ID/progress" || true)
  XP=$(echo "$PROG_RES" | grep -o '"xpTotal":[0-9]*' | head -n 1 | sed 's/"xpTotal"://')
  if [ "$XP" = "0" ] && echo "$PROG_RES" | grep -F "\"nodeId\":\"$N2_ID\",\"status\":\"locked\"" > /dev/null; then
    PASO7_OK=1
    break
  fi
  sleep 1
done

if [ "$PASO7_OK" -eq 1 ]; then
  echo "OK paso 7: Cierre D1 desaprobado procesado: XP se mantiene en 0 y N2 continua locked"
else
  echo "FALLO paso 7: Estado incorrecto tras D1 desaprobado: $PROG_RES"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paso 8: Cierra D1 aprobado: XP pasa a +100, N1 completed y N2 enabled
# ---------------------------------------------------------------------------
echo "--- Paso 8: Cerrando D1 aprobado y esperando desbloqueo asíncrono (reintento hasta 15s)..."
curl -s -X POST "$GATEWAY_URL/api/engine-challenge/mock/close" \
  -H "Content-Type: application/json" \
  -d "{\"studentId\":\"$STUDENT_ID\",\"courseId\":\"$COHORT_ID\",\"challengeId\":\"$D1_ID\",\"nodeId\":\"$N1_ID\",\"approved\":true}" > /dev/null

PASO8_OK=0
for i in $(seq 1 15); do
  PROG_RES=$(curl -s -b "$COOKIES_STUDENT" "$GATEWAY_URL/api/roadmap/courses/$COHORT_ID/students/$STUDENT_ID/progress" || true)
  XP=$(echo "$PROG_RES" | grep -o '"xpTotal":[0-9]*' | head -n 1 | sed 's/"xpTotal"://')
  if [ "$XP" = "100" ] && \
     echo "$PROG_RES" | grep -F "\"nodeId\":\"$N1_ID\",\"status\":\"completed\"" > /dev/null && \
     echo "$PROG_RES" | grep -F "\"nodeId\":\"$N2_ID\",\"status\":\"enabled\"" > /dev/null; then
    PASO8_OK=1
    break
  fi
  sleep 1
done

if [ "$PASO8_OK" -eq 1 ]; then
  echo "OK paso 8: Cierre D1 aprobado procesado: XP pasa a +100, N1 completed y N2 enabled"
else
  echo "FALLO paso 8: No se alcanzo XP=100 con N1 completed y N2 enabled en 15s. Ultimo progreso: $PROG_RES"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paso 9: GET /api/roadmap/courses/{id}/students/me/level responde 200 con su nivel
# ---------------------------------------------------------------------------
echo "--- Paso 9: Consultando nivel del alumno 02 (PAR-09 de backoffice)..."
LEVEL_RES=$(curl -s -b "$COOKIES_STUDENT" "$GATEWAY_URL/api/roadmap/courses/$COHORT_ID/students/me/level")
if echo "$LEVEL_RES" | grep -q '"level":' && echo "$LEVEL_RES" | grep -q '"totalXp":100'; then
  echo "OK paso 9: GET /api/roadmap/courses/$COHORT_ID/students/me/level responde 200 con nivel del alumno (PAR-09 validado)"
else
  echo "FALLO paso 9: Consulta de nivel fallo o no contiene los datos esperados: $LEVEL_RES"
  exit 1
fi

echo "=== TODOS LOS PASOS 1-9 COMPLETADOS EXITOSAMENTE ==="
