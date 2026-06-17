const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');

function log(message, color) {
  const colors = {
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    dark: '\x1b[90m'
  };
  const reset = '\x1b[0m';
  console.log(`${colors[color] || ''}${message}${reset}`);
}

function step(message) {
  log('', '');
  log(`==> ${message}`, 'cyan');
}

function success(message) {
  log(`✔  ${message}`, 'green');
}

function warn(message) {
  log(`⚠  ${message}`, 'yellow');
}

function fail(message) {
  log(`✗  ${message}`, 'red');
  process.exit(1);
}

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  log('', '');
  log('  回声岛 (Echo Island) - 本地开发启动', 'magenta');
  log('=========================================', 'magenta');

  try {
    process.chdir(PROJECT_ROOT);

    step('检查环境变量配置...');
    if (!fs.existsSync(path.join(PROJECT_ROOT, '.env'))) {
      if (fs.existsSync(path.join(PROJECT_ROOT, '.env.example'))) {
        fs.copyFileSync(
          path.join(PROJECT_ROOT, '.env.example'),
          path.join(PROJECT_ROOT, '.env')
        );
        warn('已从 .env.example 复制生成 .env 文件');
        warn('请根据需要修改 .env 中的配置，特别是 JWT_SECRET');
      } else {
        fail('未找到 .env.example 文件');
      }
    } else {
      success('.env 文件已存在');
    }

    step('检查 Docker Desktop 状态...');
    try {
      await exec('docker', ['version'], { stdio: 'pipe' });
      success('Docker Desktop 正在运行');
    } catch (e) {
      fail('请先启动 Docker Desktop');
    }

    step('启动 MongoDB 容器...');
    await exec('docker', ['compose', 'up', '-d', 'db']);
    success('MongoDB 容器已启动');

    process.chdir(BACKEND_DIR);

    step('等待 MongoDB 就绪...');
    process.env.MONGO_URI = 'mongodb://localhost:27223/echo_island';
    await exec('npm', ['run', 'wait:db']);
    success('MongoDB 已就绪');

    step('检查并安装后端依赖...');
    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
      warn('node_modules 不存在，开始安装依赖...');
      await exec('npm', ['ci']);
      success('依赖安装完成');
    } else {
      success('依赖已安装');
    }

    step('初始化演示数据...');
    try {
      await exec('npm', ['run', 'seed']);
      success('演示数据初始化完成');
    } catch (e) {
      warn('数据初始化失败（可能已存在数据），继续启动...');
    }

    step('启动后端开发服务...');
    log('', '');
    log('  服务地址:', 'white');
    log('  - API:     http://localhost:8223', 'white');
    log('  - 健康检查: http://localhost:8223/health', 'white');
    log('  - WS:      ws://localhost:8223/ws', 'white');
    log('', '');
    log('  演示账号 (统一密码: password1):', 'white');
    log('  - admin     (管理员)', 'white');
    log('  - fogdao    (月度会员)', 'white');
    log('  - tide_writer', 'white');
    log('  - lowfreq_fan', 'white');
    log('  - calm_asker', 'white');
    log('', '');
    log('按 Ctrl+C 停止服务', 'dark');
    log('', '');

    await exec('npm', ['run', 'dev']);

  } catch (err) {
    fail(`启动失败: ${err.message}`);
  }
}

main();
