import pool from '../db/pool.js';
import { recordAudit } from '../lib/audit.js';
import { getOperatorName } from '../lib/settings.js';
import {
  classifyRequest,
  entityIdFromPath,
  normalisePath,
  safeBody,
} from '../lib/auditRules.js';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

export function auditRequests(req, res, next) {
  if (READ_ONLY.has(req.method)) return next();

  let responseBody;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const path = normalisePath(req.originalUrl);
    const kind = classifyRequest(req.method, path, res.statusCode);
    if (!kind) return;

    const isAuth = path.startsWith('/api/auth/');
    const details = isAuth
      ? { ip: req.ip }
      : {
          method: req.method,
          path,
          request: safeBody(req.body),
          result: safeBody(responseBody),
        };

    getOperatorName()
      .then((actor) =>
        recordAudit(pool, {
          actor,
          action: kind.action,
          entityType: kind.entityType,
          entityId: isAuth
            ? null
            : (responseBody?.id ?? entityIdFromPath(path)),
          details,
        })
      )
      .catch((error) => {
        console.error('Could not write audit entry:', error);
      });
  });

  next();
}
