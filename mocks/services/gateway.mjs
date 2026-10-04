import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { json, problem, cookies } from '../lib/http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
let eurekaBase = (process.env.EUREKA_URL || 'http://eureka:8761/eureka').replace(/\/+$/, '');
if (!eurekaBase.endsWith('/eureka')) {
  eurekaBase = `${eurekaBase}/eureka`;
}

// Cache de instancias de Eureka con TTL de 5s
const cache = new Map();
const CACHE_TTL_MS = 5000;

async function resolveService(appName) {
  const cached = cache.get(appName);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.instance;
  }

  try {
    const res = await fetch(`${eurekaBase}/apps/${appName}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    let instances = data?.application?.instance;
    if (!instances) return null;
    if (!Array.isArray(instances)) instances = [instances];

    const upInstance = instances.find(inst => inst.status === 'UP');
    if (!upInstance) return null;

    const hostName = upInstance.hostName || upInstance.ipAddr;
    const port = Number(upInstance.port?.['$'] ?? upInstance.port);
    const instance = { hostName, port };

    cache.set(appName, { instance, expiresAt: now + CACHE_TTL_MS });
    return instance;
  } catch (err) {
    console.warn(`[gateway] Error resolving ${appName} from Eureka: ${err.message}`);
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[gateway] ${req.method} ${pathname} -> ${res.statusCode} ${ms}ms`);
  });

  // Extras propios: GET /_mock/
  if (pathname === '/_mock' || pathname === '/_mock/' || pathname === '/_mock/index.html') {
    if (req.method !== 'GET') {
      return problem(res, 405, 'method-not-allowed', 'Método no permitido');
    }
    const panelPath = path.resolve(__dirname, '../panel/index.html');
    if (fs.existsSync(panelPath)) {
      const content = fs.readFileSync(panelPath, 'utf-8');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(content);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Panel pendiente</title></head><body><h1>Panel pendiente</h1></body></html>');
  }

  // Extras propios: GET /_mock/registry
  if (pathname === '/_mock/registry') {
    if (req.method !== 'GET') {
      return problem(res, 405, 'method-not-allowed', 'Método no permitido');
    }
    try {
      const eurekaRes = await fetch(`${eurekaBase}/apps`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!eurekaRes.ok) {
        return json(res, 200, []);
      }
      const data = await eurekaRes.json();
      let apps = data?.applications?.application;
      if (!apps) apps = [];
      if (!Array.isArray(apps)) apps = [apps];

      const registry = apps.map(app => {
        let instList = app.instance;
        if (!instList) instList = [];
        if (!Array.isArray(instList)) instList = [instList];
        return {
          app: app.name,
          instances: instList.map(i => ({
            hostName: i.hostName,
            port: Number(i.port?.['$'] ?? i.port),
            status: i.status
          }))
        };
      });

      return json(res, 200, registry);
    } catch (err) {
      console.warn(`[gateway] Error fetching Eureka registry: ${err.message}`);
      return json(res, 200, []);
    }
  }

  // Ruteo /api/{seg}/**
  const match = pathname.match(/^\/api\/([^/]+)(\/.*)?$/);
  if (!match) {
    return problem(res, 404, 'not-found', 'Ruta no encontrada');
  }

  const seg = match[1];
  const appName = `${seg.toUpperCase()}-SERVICE`;
  const instance = await resolveService(appName);
  if (!instance) {
    return problem(res, 503, 'service-unavailable', `${seg}-service no está registrado`);
  }

  // Procesamiento de Identidad
  const cookieList = cookies(req);
  let rawToken = cookieList['fu_at'];
  if (!rawToken && req.headers.authorization) {
    const auth = req.headers.authorization.trim();
    if (auth.toLowerCase().startsWith('bearer ')) {
      rawToken = auth.slice(7).trim();
    }
  }

  let parsedToken = null;
  if (rawToken && rawToken.startsWith('mock.')) {
    try {
      const b64 = rawToken.slice(5);
      const jsonStr = Buffer.from(b64, 'base64url').toString('utf-8');
      parsedToken = JSON.parse(jsonStr);
    } catch (err) {
      console.warn(`[gateway] Token mock no pudo ser decodificado: ${err.message}`);
    }
  }

  const proxyHeaders = { ...req.headers };
  proxyHeaders['x-request-id'] = req.headers['x-request-id'] || randomUUID();

  if (parsedToken) {
    delete proxyHeaders['x-principal-type'];
    delete proxyHeaders['x-user-id'];
    delete proxyHeaders['x-user-roles'];
    delete proxyHeaders['x-service-id'];
    delete proxyHeaders['x-service-scopes'];

    if (parsedToken.type === 'user') {
      proxyHeaders['x-principal-type'] = 'user';
      proxyHeaders['x-user-id'] = parsedToken.sub;
      proxyHeaders['x-user-roles'] = (parsedToken.roles || []).join(',');
    } else if (parsedToken.type === 'service') {
      proxyHeaders['x-principal-type'] = 'service';
      proxyHeaders['x-service-id'] = parsedToken.sub;
      const scopes = (parsedToken.scopes || []).join(',');
      proxyHeaders['x-service-scopes'] = scopes ? `MS,${scopes}` : 'MS';
    }
  }

  proxyHeaders.host = `${instance.hostName}:${instance.port}`;

  // Streaming proxy con node:http sin reescribir path
  const proxyReq = http.request({
    hostname: instance.hostName,
    port: instance.port,
    path: req.url,
    method: req.method,
    headers: proxyHeaders
  }, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error(`[gateway] Proxy error conectando a ${instance.hostName}:${instance.port}: ${err.message}`);
    if (!res.headersSent) {
      problem(res, 503, 'service-unavailable', `${seg}-service no responde`);
    }
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`[gateway] Escuchando en puerto ${PORT}`);
});
