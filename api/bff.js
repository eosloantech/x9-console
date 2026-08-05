// Vercel serverless function: every /bff/* is rewritten here (vercel.json).
// The original req.url is preserved by the rewrites, so the Express app routes normally.
import app from '../server/app.js';

export default app;
