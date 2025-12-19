import { Schema, model, Types } from 'mongoose';

const ProductSchema = new Schema(
  {
    companyId: {
      type: Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
    },

    stock: {
      type: Number,
      default: 0,
    },

    category: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    subcategory: {
      type: String,
      trim: true,
    },

    available: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

export const Product = model('Product', ProductSchema);
