const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Authentication middleware function
const authenticateUser = async (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new Error('No token provided');
  }

  const { data: user, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Invalid token');
  }

  // Get user role
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role, org_id')
    .eq('user_id', user.user.id)
    .single();

  if (roleError) {
    throw new Error('No role assigned');
  }

  return {
    user: user.user,
    userRole: roleData.role,
    orgId: roleData.org_id
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, userRole, orgId } = await authenticateUser(req);
    
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: reports, error } = await supabase
      .from('campaign_reports')
      .select('*')
      .eq('org_id', orgId);

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
}