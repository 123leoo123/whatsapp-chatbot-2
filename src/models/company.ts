import { Schema, model } from 'mongoose';

const CompanySchema = new Schema({
  name: { type: String, required: true },

  whatsappPhoneNumberId: {
    type: String,
    required: true,
    unique: true, // 🔑 resolve multi-tenant
    index: true,
  },

  address: String,
  businessHours: String,
  paymentMethods: [String],

  createdAt: { type: Date, default: Date.now },
});

export const Company = model('Company', CompanySchema);
