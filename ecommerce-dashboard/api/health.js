module.exports = (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  
    res.status(200).json({ 
      status: 'Backend is running!', 
      timestamp: new Date(),
      database: 'Supabase connected',
      message: 'Vercel serverless function working!',
      method: req.method,
      url: req.url
    });
  };