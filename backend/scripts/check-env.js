require('dotenv').config();

const path = require('path');

const errors = [];
const warnings = [];
const infos = [];

const DEFAULT_JWT_SECRET = 'echo-island-dev-secret-change-me';

function checkRequired(name, defaultValue) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    if (defaultValue) {
      warnings.push(`${name}: 使用默认值，请在生产环境中显式设置`);
      infos.push(`  ${name}=${defaultValue}`);
    } else {
      errors.push(`${name}: 缺失必填环境变量`);
    }
    return false;
  }
  return true;
}

function checkNodeVersion() {
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0], 10);
  if (major < 18) {
    errors.push(`Node.js 版本过低: v${version}，需要 >= 18.17.0`);
  } else if (major > 20) {
    warnings.push(`Node.js 版本: v${version}，推荐使用 LTS 20.x`);
  } else {
    infos.push(`Node.js 版本: v${version} ✓`);
  }
}

console.log('\n=== 回声岛环境配置检查 ===\n');

checkNodeVersion();

infos.push(`\n运行环境: ${process.env.NODE_ENV || 'development (默认)'}\n`);

checkRequired('NODE_ENV', 'development');
checkRequired('PORT', '8223');
checkRequired('MONGO_URI', 'mongodb://localhost:27017/echo_island');
checkRequired('WS_PATH', '/ws');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  errors.push('JWT_SECRET: 缺失');
} else if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.includes('dev') || jwtSecret.length < 16) {
  if (process.env.NODE_ENV === 'production') {
    errors.push('JWT_SECRET: 生产环境必须使用高强度随机密钥（至少32位以上）');
  } else {
    warnings.push('JWT_SECRET: 当前为开发环境密钥，生产环境必须更换');
  }
} else {
  infos.push('JWT_SECRET: 已配置');
}

checkRequired('JWT_EXPIRES_IN', '7d');
checkRequired('STORAGE_PROVIDER', 'local');
checkRequired('LOCAL_UPLOAD_DIR', 'uploads');

if (process.env.RECOMMENDATION_ENABLED === undefined) {
  infos.push('RECOMMENDATION_ENABLED: 默认启用');
}

console.log('信息:');
infos.forEach((msg) => console.log(`  ${msg}`));

if (warnings.length > 0) {
  console.log('\n警告:');
  warnings.forEach((msg) => console.log(`  ⚠  ${msg}`));
}

if (errors.length > 0) {
  console.log('\n错误:');
  errors.forEach((msg) => console.log(`  ✗ ${msg}`));
  console.log('\n检查失败，请修复以上问题。');
  process.exit(1);
}

console.log('\n环境检查完成！如需生成 .env 文件，请参考 ENVIRONMENT.md 获取详细配置说明。\n');
process.exit(0);
