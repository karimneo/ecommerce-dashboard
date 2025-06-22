const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Upload CSV file
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { platform } = req.body;
    if (!platform || !['facebook', 'tiktok', 'google'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform specified' });
    }

    const csvData = [];
    const stream = Readable.from(req.file.buffer.toString());

    // Parse CSV
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          csvData.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (csvData.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or invalid' });
    }

    // Process and insert data
    const processedData = csvData.map(row => {
      // Helper function to safely parse numbers
      const parseNumber = (value) => {
        if (!value) return 0;
        const cleaned = String(value).replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Map common CSV column names to our schema
      const getColumnValue = (row, possibleNames) => {
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name];
          }
        }
        return '';
      };

      return {
        user_id: user.id,
        file_name: req.file.originalname,
        platform: platform,
        campaign_name: getColumnValue(row, ['Campaign name', 'Campaign Name', 'campaign_name', 'Campaign']),
        product_name: getColumnValue(row, ['Product name', 'Product Name', 'product_name', 'Product']),
        amount_spent: parseNumber(getColumnValue(row, ['Amount spent (CAD)', 'Amount Spent', 'Spend', 'Cost'])),
        revenue: parseNumber(getColumnValue(row, ['Purchase ROAS (return on ad spend)', 'Revenue', 'Purchase Value', 'Conversion Value'])),
        conversions: parseNumber(getColumnValue(row, ['Purchases', 'Conversions', 'Orders', 'Results'])),
        clicks: parseNumber(getColumnValue(row, ['Link clicks', 'Clicks', 'Link Clicks'])),
        impressions: parseNumber(getColumnValue(row, ['Impressions', 'Reach'])),
        raw_data: row
      };
    });

    // Insert into database
    const { data: insertedData, error: insertError } = await supabase
      .from('campaign_reports')
      .insert(processedData)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to save data to database' });
    }

    // Create upload history record
    const { error: historyError } = await supabase
      .from('upload_history')
      .insert({
        user_id: user.id,
        file_name: req.file.originalname,
        platform: platform,
        rows_processed: processedData.length,
        status: 'completed'
      });

    if (historyError) {
      console.error('History error:', historyError);
    }

    res.json({
      message: 'File uploaded successfully',
      rowsProcessed: processedData.length,
      data: insertedData
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;