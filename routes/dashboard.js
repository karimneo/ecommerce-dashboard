const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get dashboard analytics
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

    // Get campaign data
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaign_reports')
      .select('*')
      .eq('user_id', user.id);

    if (campaignError) {
      return res.status(500).json({ error: campaignError.message });
    }

    // Calculate KPIs
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.amount_spent || 0), 0);
    const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);
    const roas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;

    // Platform breakdown
    const platformData = campaigns.reduce((acc, campaign) => {
      const platform = campaign.platform || 'unknown';
      if (!acc[platform]) {
        acc[platform] = { spend: 0, revenue: 0, conversions: 0 };
      }
      acc[platform].spend += campaign.amount_spent || 0;
      acc[platform].revenue += campaign.revenue || 0;
      acc[platform].conversions += campaign.conversions || 0;
      return acc;
    }, {});

    // Recent uploads
    const { data: recentUploads } = await supabase
      .from('upload_history')
      .select('*')
      .eq('user_id', user.id)
      .order('upload_date', { ascending: false })
      .limit(5);

    res.json({
      kpis: {
        totalSpend: totalSpend.toFixed(2),
        totalRevenue: totalRevenue.toFixed(2),
        roas: roas.toFixed(2),
        totalOrders: totalConversions
      },
      platformData,
      recentUploads: recentUploads || []
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;