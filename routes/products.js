const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Get all products
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

    // Get products with performance data
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (productsError) {
      return res.status(500).json({ error: productsError.message });
    }

    // Get campaign data for each product
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaign_reports')
      .select('*')
      .eq('user_id', user.id);

    if (campaignsError) {
      return res.status(500).json({ error: campaignsError.message });
    }

    // Calculate performance metrics for each product
    const productsWithMetrics = products.map(product => {
      const productCampaigns = campaigns.filter(c => 
        c.product_name && c.product_name.toLowerCase().includes(product.product_name.toLowerCase())
      );

      const totalSpend = productCampaigns.reduce((sum, c) => sum + (c.amount_spent || 0), 0);
      const totalRevenue = productCampaigns.reduce((sum, c) => sum + (c.revenue || 0), 0);
      const totalConversions = productCampaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

      // Find best performing platform
      const platformPerformance = productCampaigns.reduce((acc, campaign) => {
        const platform = campaign.platform;
        if (!acc[platform]) {
          acc[platform] = { spend: 0, revenue: 0, roas: 0 };
        }
        acc[platform].spend += campaign.amount_spent || 0;
        acc[platform].revenue += campaign.revenue || 0;
        return acc;
      }, {});

      let bestPlatform = 'N/A';
      let bestRoas = 0;
      for (const [platform, metrics] of Object.entries(platformPerformance)) {
        const roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
        platformPerformance[platform].roas = roas;
        if (roas > bestRoas) {
          bestRoas = roas;
          bestPlatform = platform;
        }
      }

      return {
        ...product,
        totalSpend: totalSpend.toFixed(2),
        totalRevenue: totalRevenue.toFixed(2),
        totalConversions,
        bestPlatform,
        roas: totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00'
      };
    });

    res.json(productsWithMetrics);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new product
router.post('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const { product_name, revenue_per_conversion } = req.body;

    if (!product_name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        user_id: user.id,
        product_name,
        revenue_per_conversion: revenue_per_conversion || 0
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product
router.put('/:id', async (req, res) => {
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
    const { product_name, revenue_per_conversion } = req.body;

    const { data, error } = await supabase
      .from('products')
      .update({
        product_name,
        revenue_per_conversion
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
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

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Product deleted successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;