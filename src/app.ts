import express, { Express, Request, Response } from 'express';
import webhookRoutes from './routes/webhook.routes';

const app: Express = express();

app.use(express.json());
app.use('/webhook', webhookRoutes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

export default app;
