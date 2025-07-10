const https = require('https');

// Replace with your actual endpoints from 'serverless info'
const CONFIG = {
  httpApiUrl:  process.env.HTTP_API_URL,
  websocketUrl: process.env.WEBSOCKET_URL,  
  region: 'us-east-1',
  stage: 'dev'
};

function checkEndpoint(url, method = 'GET', data = null) {
  return new Promise((resolve) => {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: body,
          success: res.statusCode < 500
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        status: 0,
        body: error.message,
        success: false
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        body: 'Request timeout',
        success: false
      });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runHealthCheck() {
  console.log('🏥 Starting Health Check...\n');
  
  const checks = [
    {
      name: 'Create Room Endpoint',
      test: () => checkEndpoint(CONFIG.httpApiUrl + '/create-room', 'POST', {
        userId: 'health-check-user',
        latitude: 40.7128,
        longitude: -74.0060,
        roomType: 'public',
        maxParticipants: 2
      })
    },
    {
      name: 'Search Rooms Endpoint',
      test: () => checkEndpoint(CONFIG.httpApiUrl + '/search-rooms?latitude=40.7128&longitude=-74.0060')
    }
  ];

  let totalChecks = 0;
  let passedChecks = 0;

  for (const check of checks) {
    totalChecks++;
    console.log(`🔍 Testing ${check.name}...`);
    
    const result = await check.test();
    
    if (result.success) {
      console.log(`✅ ${check.name}: PASSED (Status: ${result.status})`);
      passedChecks++;
    } else {
      console.log(`❌ ${check.name}: FAILED (Status: ${result.status})`);
      console.log(`   Error: ${result.body}`);
    }
    console.log('');
  }

  console.log(`📊 Health Check Summary: ${passedChecks}/${totalChecks} checks passed`);
  
  if (passedChecks === totalChecks) {
    console.log('🎉 All systems operational!');
  } else {
    console.log('⚠️  Some issues detected. Check the logs above.');
  }
}

// Check if endpoints are configured
function validateConfig() {
  const issues = [];
  
  if (CONFIG.httpApiUrl.includes('your-api-id')) {
    issues.push('HTTP API URL not configured');
  }
  
  if (CONFIG.websocketUrl.includes('your-websocket-id')) {
    issues.push('WebSocket URL not configured');
  }
  
  if (issues.length > 0) {
    console.log('❌ Configuration Issues:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log('\n💡 Run "serverless info --stage dev" to get your actual endpoints');
    return false;
  }
  
  return true;
}

if (require.main === module) {
  if (validateConfig()) {
    runHealthCheck();
  }
}

module.exports = { runHealthCheck, checkEndpoint };