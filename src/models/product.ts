import { Schema, model, Types } from 'mongoose';

const ProductSchema = new Schema({
  companyId: {
    type: Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },

  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  category: String,

  createdAt: { type: Date, default: Date.now },
});

export const Product = model('Product', ProductSchema);
