const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://localhost:3000',
    'https://lovableproject.com',
    'https://stratagem-commerce-insights.lovable.app',
    'https://ecommerce-dashboard-backend-qhke.onrender.com',
    'https://id-preview--b63b7351-cd45-4fb3-b99a-b230fbb3c376.lovable.app',
    /^https:\/\/.*\.lovableproject\.com$/,
    /^https:\/\/.*\.lovable\.dev$/,
    /^https:\/\/.*\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Knowledge-Base']
}));

app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const { data: user, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user.user;
    req.userRole = 'admin';
    req.orgId = null;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// OPTIONS preflight
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  res.sendStatus(200);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Backend is running!', 
    timestamp: new Date(),
    database: 'Supabase connected',
    uploadsDir: uploadsDir,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Ecommerce Dashboard API',
    status: 'Running',
    endpoints: ['/api/health', '/api/upload', '/api/reports', '/api/dashboard']
  });
});

// ✅ Upload CSV file
app.post('/api/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('❌ No file received');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const { platform = 'Facebook' } = req.body;

    console.log('🟢 Upload started:', fileName);

    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          console.log('✅ CSV parsed, rows:', results.length);
          console.log('📦 Sample row:', results[0]);

          const { data: report, error } = await supabase
            .from('campaign_reports')
            .insert({
              org_id: null,
              platform,
              file_name: fileName,
              data: results,
              processed: true
            })
            .select();

          if (error) {
            console.error('❌ Supabase insert error:', error.message);
            return res.status(500).json({ error: error.message });
          }

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          res.json({
            message: 'Upload successful',
            recordCount: results.length,
            reportId: report[0].id,
            platform
          });

        } catch (dbError) {
          console.error('🔥 Crash during DB insert:', dbError.message);
          res.status(500).json({ error: dbError.message });
        }
      });

  } catch (error) {
    console.error('🚨 Upload route error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get list of uploaded reports
app.get('/api/reports', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaign_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('❌ Failed to fetch reports:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get dashboard summary
app.get('/api/dashboard', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaign_reports')
      .select('platform, data');

    if (error) throw error;

    const summary = {};
    data.forEach((row) => {
      const platform = row.platform || 'Unknown';
      const count = Array.isArray(row.data) ? row.data.length : 0;
      summary[platform] = (summary[platform] || 0) + count;
    });

    res.json({ summary });
  } catch (err) {
    console.error('❌ Failed to fetch dashboard data:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
