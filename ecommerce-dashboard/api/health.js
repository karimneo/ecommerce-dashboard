export default function handler(req, res) {
    res.status(200).json({ 
      status: 'Backend is running!', 
      timestamp: new Date(),
      database: 'Supabase connected',
      message: 'API routes working on Vercel!'
    });
  }