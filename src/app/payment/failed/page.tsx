// src/app/payment/failed/page.tsx
"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function PaymentFailedPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 dark:bg-gray-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center"
      >
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          پرداخت ناموفق
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          متأسفانه پرداخت شما با مشکل مواجه شد. لطفاً دوباره تلاش کنید.
        </p>
        <button
          onClick={() => router.push("/cart")}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition duration-200"
        >
          بازگشت به سبد خرید
        </button>
      </motion.div>
    </div>
  );
}
