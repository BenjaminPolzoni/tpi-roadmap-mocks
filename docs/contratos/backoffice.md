# Contrato de Servicio: backoffice-service (Tema 12 — Parámetros Globales PAR)

> Grupo 10 · Mock Stack `tpi-roadmap-mocks`  
> Documento de fidelidad contractual según regla R2 / R14 de `IMPLEMENTACION.md`.

## 1. Identidad y Metadatos de Infraestructura

- **Nombre en Eureka:** `backoffice-service`
- **Puerto interno:** `8100`
- **Prefijo en API Gateway:** `/api/backoffice/**`
- **Tópico Kafka:** `administration.events`
- **Producer Kafka:** `"backoffice-service"`
- **EventVersion:** `1` (R6)
- **Autenticación inter-servicio:** Token M2M emitido por `users-service` con audience `backoffice-service` y scope `backoffice.parameters.read`.

---

## 2. Fuentes Contractuales Analizadas

1. **Documento de Integración y Contrato Oficial:**
   - Documento consolidado: `Backend/tpi-roadmap/docs/contracts/backoffice-par.md` (derivado de `CONTRATO_T10_BACKOFFICE.md`)
   - Especificación de parámetros globales `PAR-01`, `PAR-09` y `PAR-12`.
   - Especificación de invalidación de caché distribuida vía evento `GLOBAL_CONFIGURATION_CHANGED`.

2. **Consumidor Roadmap (`Backend/tpi-roadmap`):**
   - Repositorio: `Backend/tpi-roadmap` @ `develop` (`02c14b9ba633d3610b9c90d696c84db32253cf80`)
   - `HttpParCatalogClient.java:98-245`:
     - Consulta batch inicial `GET /api/backoffice/parameters` para arranque en frío (`cold start`).
     - Almacenamiento local en caché con Caffeine (`cacheTtl: 5m`, `maxCacheSize: 50`).
     - `PAR-01` (XP base por dificultad): extrae campos positivos `easy`, `medium`, `hard`.
     - `PAR-09` (Curva de progresión de niveles): array de 1 a 10 niveles (`level`, `xpRequired`). Valida que arranque en `level: 1, xpRequired: 0`, que los niveles sean consecutivos ascendentes y `xpRequired` estrictamente ascendente.
     - `PAR-12` (Vidas iniciales y techo): extrae campos positivos `initialLives` y `maxLives` (`maxLives >= initialLives`).
   - `ParRefreshListener.java:54-79`:
     - Consumidor Kafka en el topic `administration.events`.
     - Filtra por `eventType: "GLOBAL_CONFIGURATION_CHANGED"`.
     - Extrae `payload.paramKey` e invalida la entrada correspondiente en el catálogo (`parameters.invalidate(paramKey)`).
   - `EventParser.java:60-93`:
     - Validación estricta del envelope v3 (`eventId`, `eventType: SCREAMING_SNAKE_CASE`, `eventVersion: 1`, `timestamp: ISO-8601`, `producer`, `payload`).

---

## 3. Endpoints Expuestos

| Método | Path | Request Body / Query | Response Body | Status | Rol / Contexto |
|---|---|---|---|---|---|
| `GET` | `/api/backoffice/parameters` | — | `ParameterResponseDto[]` | 200 | Lista completa de parámetros globales para cold start de clientes como Roadmap. |
| `GET` | `/api/backoffice/parameters/{key}` | — | `ParameterResponseDto` | 200 / 404 | Consulta individual de un parámetro por su clave (ej. `PAR-09`). |

### Shapes de Parámetros

#### Catálogo Completo (`GET /api/backoffice/parameters`)
```json
[
  {
    "key": "PAR-01",
    "value": {
      "easy": 100,
      "medium": 250,
      "hard": 500
    },
    "version": "1"
  },
  {
    "key": "PAR-09",
    "value": [
      { "level": 1, "xpRequired": 0 },
      { "level": 2, "xpRequired": 250 },
      { "level": 3, "xpRequired": 600 },
      { "level": 4, "xpRequired": 1000 },
      { "level": 5, "xpRequired": 1500 }
    ],
    "version": "1"
  },
  {
    "key": "PAR-12",
    "value": {
      "initialLives": 3,
      "maxLives": 5
    },
    "version": "1"
  }
]
```

---

## 4. Endpoints Exclusivos del Mock (R3)

| Método | Path | Request Body | Response Body | Propósito |
|---|---|---|---|---|
| `GET` | `/api/backoffice/mock/ping` | — | `{ service, ok: true }` | Liveness check básico y smoke test. |
| `GET` | `/api/backoffice/mock/echo` | — | Headers recibidos | Diagnóstico de cabeceras recibidas a través del Gateway. |
| `PUT` | `/api/backoffice/mock/parameters/{key}` | `{ value }` | `{ ok: true, key, value, version }` | Actualiza en caliente el valor de un parámetro y despacha evento Kafka `GLOBAL_CONFIGURATION_CHANGED`. |
| `POST` | `/api/backoffice/mock/fault` | `{ status, delayMs, pathPrefix?, times? }` | `{ ok: true, fault }` | Inyección de fallas simuladas (ej. latencia o errores 503). |
| `DELETE` | `/api/backoffice/mock/fault` | — | `{ ok: true, cleared: true }` | Limpieza de fallas simuladas. |

---

## 5. Eventos Kafka Publicados

Tópico: **`administration.events`**  
Producer: **`backoffice-service`**  
EventVersion: **`1`** (entero obligatorio según R6)

### `GLOBAL_CONFIGURATION_CHANGED`
- **Key:** `paramKey` (string, ej. `"PAR-09"`)
- **Payload:**
```json
{
  "paramKey": "PAR-09",
  "version": "2"
}
```
- **Envelope completo emitido:**
```json
{
  "eventId": "9bf19168-67dc-4eb3-86b8-9929ab614bc7",
  "eventType": "GLOBAL_CONFIGURATION_CHANGED",
  "eventVersion": 1,
  "timestamp": "2026-10-03T22:38:22.790Z",
  "producer": "backoffice-service",
  "payload": {
    "paramKey": "PAR-09",
    "version": "2"
  }
}
```
