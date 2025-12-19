import 'dotenv/config';
import express from 'express';
import { connectMongo } from './database/mongo';
import webhookRoutes from './routes/webhook.routes';
import testRoutes from './routes/test.routes';

const app = express();

app.use(express.json());

//  CONEXÃO COM O MONGO 
connectMongo()
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo connection error:', err));

app.use('/webhook', webhookRoutes);
app.use('/test', testRoutes);

export default app;

// teste