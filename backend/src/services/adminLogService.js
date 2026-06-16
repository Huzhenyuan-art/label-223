const { AdminOperationLog } = require('../models');
const logger = require('../utils/logger');

const getClientIp = (req) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || '';
};

exports.logOperation = async (req, { module, action, targetId = null, targetType = '', detail = {} }) => {
  try {
    const adminId = req.userId;
    const adminName = req.user?.nickname || req.user?.account || 'unknown';

    await AdminOperationLog.create({
      adminId,
      adminName,
      module,
      action,
      targetId,
      targetType,
      detail,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (error) {
    logger.error(`Log admin operation failed: ${error.message}`);
  }
};

exports.createOperationLogger = (module, action, getTargetInfo = null) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    let logged = false;

    res.json = (data) => {
      if (!logged) {
        logged = true;
        let targetId = null;
        let targetType = '';
        let detail = {};

        if (getTargetInfo) {
          try {
            const info = getTargetInfo(req, data);
            targetId = info.targetId || null;
            targetType = info.targetType || '';
            detail = info.detail || {};
          } catch (e) {
            logger.error(`Get target info for log failed: ${e.message}`);
          }
        }

        if (req.params?.id) {
          targetId = targetId || req.params.id;
        }
        if (req.body) {
          detail = { ...detail, ...req.body };
        }

        exports.logOperation(req, { module, action, targetId, targetType, detail }).catch(() => {});
      }
      return originalJson(data);
    };

    next();
  };
};
