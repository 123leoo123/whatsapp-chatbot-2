import 'dotenv/config';
import express from 'express';
import { connectMongo } from './database/mongo';
import webhookRoutes from './routes/webhook.routes';

const app = express();

app.use(express.json());

// 🔑 CONEXÃO COM O MONGO (OBRIGATÓRIA)
connectMongo()
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo connection error:', err));

app.use('/webhook', webhookRoutes);

export default app;
