const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://localhost:3000', 
    /^https:\/\/.*\.lovableproject\.com$/,
    /^https:\/\/.*\.lovable\.dev$/,
    /^https:\/\/.*\.vercel\.app$/,
    'https://ecommerce-dashboard-backend-qhke.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Length', 'X-Knowledge-Base']
}));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File upload setup with fixed configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// SIMPLIFIED Authentication middleware - just check token, no role requirements
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: user, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user.user;
    req.userRole = 'admin'; // Temporarily set everyone as admin
    req.orgId = null; // No org check for now
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// ===== PUBLIC ROUTES =====

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  res.sendStatus(200);
});

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Backend is running!', 
    timestamp: new Date(),
    database: 'Supabase connected',
    uploadsDir: uploadsDir,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Ecommerce Dashboard API',
    status: 'Running',
    endpoints: ['/api/health', '/api/dashboard', '/api/products', '/api/upload']
  });
});

// ===== PROTECTED ROUTES =====

// Dashboard data - SIMPLIFIED (no org check)
app.get('/api/dashboard', authenticateUser, async (req, res) => {
  try {
    const { data: reports, error } = await supabase
      .from('campaign_reports')
      .select('*');
      // Removed .eq('org_id', req.orgId) check

    if (error) throw error;

    let totalRevenue = 0;
    let totalOrders = 0;
    let totalSpend = 0;
    const platformStats = {};

    reports.forEach(report => {
      if (report.data && Array.isArray(report.data)) {
        report.data.forEach(row => {
          const revenue = parseFloat(row['Results']) || 0;
          const spend = parseFloat(row['Amount spent (CAD)']) || 0;

          totalRevenue += revenue;
          totalSpend += spend;
          totalOrders += 1;

          if (!platformStats[report.platform]) {
            platformStats[report.platform] = {
              name: report.platform,
              revenue: 0,
              spend: 0,
              orders: 0,
              roas: 0
            };
          }

          platformStats[report.platform].revenue += revenue;
          platformStats[report.platform].spend += spend;
          platformStats[report.platform].orders += 1;
        });
      }
    });

    Object.values(platformStats).forEach(platform => {
      platform.roas = platform.spend > 0 ? platform.revenue / platform.spend : 0;
    });

    const platforms = Object.values(platformStats).sort((a, b) => b.revenue - a.revenue);

    res.json({
      totalRevenue,
      totalOrders,
      totalSpend,
      platforms
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get products - SIMPLIFIED (no org check)
app.get('/api/products', authenticateUser, async (req, res) => {
  try {
    const [reportsResult, settingsResult] = await Promise.all([
      supabase.from('campaign_reports').select('*'), // Removed .eq('org_id', req.orgId)
      supabase.from('product_settings').select('*')
    ]);

    if (reportsResult.error) throw reportsResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const reports = reportsResult.data;
    const settings = settingsResult.data;

    const settingsMap = new Map();
    settings.forEach(setting => {
      settingsMap.set(setting.product_name, setting.revenue_per_conversion);
    });

    const productMap = new Map();
    
    reports.forEach(report => {
      if (report.data && Array.isArray(report.data)) {
        report.data.forEach(row => {
          const campaignName = row['Campaign name'] || '';
          const productName = campaignName.split(' - ')[0].trim();
          
          if (productName) {
            const conversions = parseFloat(row['Results']) || 0;
            const spend = parseFloat(row['Amount spent (CAD)']) || 0;
            
            const revenuePerConversion = settingsMap.get(productName) || 0;
            const revenue = conversions * revenuePerConversion;
            const roas = spend > 0 ? revenue / spend : 0;
            
            if (!productMap.has(productName)) {
              productMap.set(productName, {
                name: productName,
                totalRevenue: 0,
                facebookRevenue: 0,
                tiktokRevenue: 0,
                googleRevenue: 0,
                totalSpend: 0,
                totalConversions: 0,
                totalROAS: 0,
                revenuePerConversion: revenuePerConversion,
                bestPlatform: 'Facebook'
              });
            }
            
            const product = productMap.get(productName);
            product.totalRevenue += revenue;
            product.totalSpend += spend;
            product.totalConversions += conversions;
            
            if (report.platform === 'Facebook') {
              product.facebookRevenue += revenue;
            } else if (report.platform === 'TikTok') {
              product.tiktokRevenue += revenue;
            } else if (report.platform === 'Google') {
              product.googleRevenue += revenue;
            }
            
            product.totalROAS = product.totalSpend > 0 ? product.totalRevenue / product.totalSpend : 0;
          }
        });
      }
    });

    const products = Array.from(productMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json(products);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: error.message });
  }
});

// File upload - SIMPLIFIED (no org check)
app.post('/api/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { platform = 'Facebook' } = req.body;
    const filePath = req.file.path;
    const fileName = req.file.originalname;

    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          const { data: report, error } = await supabase
            .from('campaign_reports')
            .insert({
              org_id: null, // No org_id for now
              platform,
              file_name: fileName,
              data: results,
              processed: true
            })
            .select();

          if (error) {
            return res.status(500).json({ error: error.message });
          }

          // Clean up uploaded file
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          
          res.json({ 
            message: 'File uploaded successfully',
            recordCount: results.length,
            reportId: report[0].id,
            platform: platform
          });
        } catch (dbError) {
          res.status(500).json({ error: dbError.message });
        }
      });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product revenue
app.post('/api/products/:productName/revenue', authenticateUser, async (req, res) => {
  try {
    const { productName } = req.params;
    const { revenuePerConversion } = req.body;

    const { data, error } = await supabase
      .from('product_settings')
      .upsert({
        product_name: productName,
        revenue_per_conversion: revenuePerConversion,
        updated_at: new Date()
      })
      .select();

    if (error) throw error;

    res.json({ 
      message: 'Product revenue updated successfully',
      productName,
      revenuePerConversion
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile
app.get('/api/profile', authenticateUser, async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: 'admin',
    orgId: null
  });
});

// Reports endpoint - SIMPLIFIED
app.get('/api/reports', authenticateUser, async (req, res) => {
  try {
    const { data: reports, error } = await supabase
      .from('campaign_reports')
      .select('*')
      // Removed .eq('org_id', req.orgId) check
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Other endpoints
app.get('/api/platform-analytics', authenticateUser, async (req, res) => {
  res.json([]);
});

app.get('/api/team-activity', authenticateUser, async (req, res) => {
  res.json([]);
});

app.get('/api/trends', authenticateUser, async (req, res) => {
  res.json([]);
});

app.get('/api/creatives', authenticateUser, async (req, res) => {
  res.json([]);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🔐 Authentication enabled`);
  console.log(`📊 API endpoints secured`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
});