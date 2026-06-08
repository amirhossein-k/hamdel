// src\lib\mongodb.js
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}
export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: "hamdel", // ✅ همیشه به دیتابیس درست وصل می‌شود

      bufferCommands: false, // مهم: بافر را غیرفعال می‌کند تا فوراً خطا بدهد
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
س;
