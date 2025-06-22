const http = require('http');
const url = require('url');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('✅ Supabase connected');
} else {
  console.log('❌ Missing Supabase credentials');
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check route
  if (parsedUrl.pathname === '/api/health') {
    const response = {
      status: 'OK',
      message: 'BiZense Backend is running!',
      timestamp: new Date().toISOString(),
      supabase: supabase ? 'Connected' : 'Not connected'
    };
    res.writeHead(200);
    res.end(JSON.stringify(response));
    return;
  }

  // Test Supabase connection
  if (parsedUrl.pathname === '/api/test-db') {
    if (!supabase) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Supabase not configured' }));
      return;
    }

    try {
      // Test query - get tables
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);

      const response = {
        message: 'Database connection successful!',
        error: error ? error.message : null,
        timestamp: new Date().toISOString()
      };
      
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Dashboard route - simple version
  if (parsedUrl.pathname === '/api/dashboard') {
    if (!supabase) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Database not connected' }));
      return;
    }

    try {
      // Get campaign reports count for now
      const { data, error } = await supabase
        .from('campaign_reports')
        .select('*')
        .limit(10);

      const response = {
        message: 'Dashboard data',
        recordCount: data ? data.length : 0,
        data: data || [],
        error: error ? error.message : null
      };
      
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404 for all other routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Route not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 BiZense Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🗄️  Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`📈 Dashboard: http://localhost:${PORT}/api/dashboard`);
});