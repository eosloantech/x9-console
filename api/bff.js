// Vercel serverless function: todo /bff/* é reescrito para cá (vercel.json).
// O req.url original é preservado pelos rewrites, então o app Express roteia normal.
import app from '../server/app.js';

export default app;
