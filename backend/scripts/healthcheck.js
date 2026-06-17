const http = require('http');

const PORT = process.env.PORT || 8223;
const HOST = process.env.HEALTHCHECK_HOST || '127.0.0.1';
const TIMEOUT = 5000;

const options = {
  host: HOST,
  port: PORT,
  timeout: TIMEOUT,
  method: 'GET',
  path: '/health'
};

const request = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const data = JSON.parse(body);
        if (data.code === 0 && data.data && data.data.status === 'ok') {
          console.log(`Health check passed: ${data.data.service} @ ${data.data.timestamp}`);
          process.exit(0);
        } else {
          console.error('Health check failed: invalid response body');
          console.error(body);
          process.exit(1);
        }
      } catch (e) {
        console.error('Health check failed: invalid JSON response');
        console.error(body);
        process.exit(1);
      }
    } else {
      console.error(`Health check failed: HTTP ${res.statusCode}`);
      console.error(body);
      process.exit(1);
    }
  });
});

request.on('error', (err) => {
  console.error(`Health check failed: ${err.message}`);
  process.exit(1);
});

request.on('timeout', () => {
  console.error('Health check failed: timeout');
  request.destroy();
  process.exit(1);
});

request.end();
