import 'dotenv/config';
import { connectMongo } from '../database/mongo';
import { Company } from '../models/company';
import { Product } from '../models/product';

(async () => {
  await connectMongo();

  const company = await Company.create({
    name: 'Loja Demo',
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    address: 'Rua Exemplo, 123',
    businessHours: '09–18',
    paymentMethods: ['Pix', 'Cartão'],
  });

  await Product.insertMany([
    { companyId: company._id, name: 'Camiseta', price: 59.9, stock: 10 },
    { companyId: company._id, name: 'Boné', price: 39.9, stock: 5 },
  ]);

  console.log('Seed done');
  process.exit(0);
})();
