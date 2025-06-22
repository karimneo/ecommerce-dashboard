const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get upload history with filters
router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { 
      platform, 
      page = 1, 
      limit = 20, 
      start_date, 
      end_date,
      search 
    } = req.query;

    let query = supabase
      .from('upload_history')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id);

    // Apply filters
    if (platform && platform !== 'all') {
      query = query.eq('platform', platform);
    }

    if (start_date) {
      query = query.gte('upload_date', start_date);
    }

    if (end_date) {
      query = query.lte('upload_date', end_date);
    }

    if (search) {
      query = query.ilike('file_name', `%${search}%`);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query
      .order('upload_date', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: uploads, error: uploadsError, count } = await query;

    if (uploadsError) {
      return res.status(500).json({ error: uploadsError.message });
    }

    // Get summary stats
    const { data: allUploads, error: statsError } = await supabase
      .from('upload_history')
      .select('status, rows_processed, upload_date')
      .eq('user_id', user.id);

    if (statsError) {
      return res.status(500).json({ error: statsError.message });
    }

    const stats = {
      totalUploads: allUploads.length,
      successfulUploads: allUploads.filter(u => u.status === 'completed').length,
      totalRowsProcessed: allUploads.reduce((sum, u) => sum + (u.rows_processed || 0), 0),
      uploadsThisMonth: allUploads.filter(u => {
        const uploadDate = new Date(u.upload_date);
        const now = new Date();
        return uploadDate.getMonth() === now.getMonth() && 
               uploadDate.getFullYear() === now.getFullYear();
      }).length
    };

    res.json({
      uploads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      },
      stats
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete upload record
router.delete('/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { id } = req.params;

    // Delete from upload history
    const { error: historyError } = await supabase
      .from('upload_history')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (historyError) {
      return res.status(500).json({ error: historyError.message });
    }

    res.json({ message: 'Upload record deleted successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;