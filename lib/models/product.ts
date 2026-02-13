import mongoose, { Schema, type InferSchemaType } from "mongoose";

const productSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    type: { type: String, required: true },
    price: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    depth: { type: Number, required: true },
  },
  {
    // Explicit collection name — prevents Mongoose auto-pluralization surprises.
    collection: "products",
  }
);

/** Mongoose-level document type for internal use. */
export type ProductDocument = InferSchemaType<typeof productSchema>;

/**
 * Mongoose model for the read-only `products` collection.
 * Uses `mongoose.models` guard to prevent "Cannot overwrite model"
 * errors during Next.js dev hot reloads.
 */
export const Product =
  mongoose.models.Product ?? mongoose.model("Product", productSchema);
