import { Router } from 'express';
import { handleWebhookEvent, verifyWebhook } from '../controllers/webhook.controller';

const router = Router();

router.get('/', verifyWebhook);
router.post('/', handleWebhookEvent);

export default router;
