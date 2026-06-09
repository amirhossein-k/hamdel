"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import axios, { AxiosError } from "axios";
import { FaSpinner, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import type { Purchase, ApiResponse, VerifyPaymentInput } from "@/types/pay";

// --- نوع وضعیت صفحه ---
type CallbackStatus = "verifying" | "success" | "failed";

// =============================================

export default function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>("verifying");

  // --- تأیید پرداخت ---
  const verifyMutation = useMutation<Purchase, Error, VerifyPaymentInput>({
    mutationFn: async ({ transId, purchaseId }) => {
      const response = await axios.post<ApiResponse<Purchase>>(
        "/api/purchases/verify",
        {
          transId,
          purchaseId,
        },
      );
      const data = response.data;
      if (!data.success || !data.data) {
        throw new Error(data.message || "پرداخت تأیید نشد");
      }
      return data.data;
    },
    onSuccess: (purchase) => {
      setStatus("success");
      // ذخیره اطلاعات فعالسازی در sessionStorage
      sessionStorage.setItem("activationData", JSON.stringify(purchase));

      // هدایت به صفحه موفقیت بعد از ۲ ثانیه
      setTimeout(() => {
        router.replace("/success");
      }, 2000);
    },
    onError: () => {
      setStatus("failed");
    },
  });

  // --- اجرای تأیید هنگام لود صفحه ---
  useEffect(() => {
    const transId = searchParams.get("transId");
    const storedPurchase = sessionStorage.getItem("currentPurchase");

    if (!transId || !storedPurchase) {
      setStatus("failed");
      return;
    }

    let purchaseId: string;
    try {
      const parsed = JSON.parse(storedPurchase) as Purchase;
      purchaseId = parsed.purchaseId;
    } catch {
      setStatus("failed");
      return;
    }

    if (!purchaseId) {
      setStatus("failed");
      return;
    }

    // جلوگیری از اجرای مجدد
    if (!verifyMutation.isIdle) return;

    verifyMutation.mutate({ transId, purchaseId });
  }, []); // فقط یک بار

  // =============================================

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-3xl shadow-xl p-12 text-center max-w-sm"
      >
        {/* حالت: در حال تأیید */}
        {status === "verifying" && (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <FaSpinner className="text-5xl text-blue-500 mx-auto mb-4" />
            </motion.div>
            <h2 className="text-xl font-bold text-gray-800">
              در حال تأیید پرداخت...
            </h2>
            <p className="text-gray-500 mt-2">لطفاً صبر کنید</p>
          </>
        )}

        {/* حالت: موفق */}
        {status === "success" && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            >
              <FaCheckCircle className="text-6xl text-green-500 mx-auto mb-4" />
            </motion.div>
            <h2 className="text-xl font-bold text-green-600">
              پرداخت با موفقیت انجام شد! 🎉
            </h2>
            <p className="text-gray-500 mt-2">
              در حال انتقال به صفحه فعالسازی...
            </p>

            {/* نوار پیشرفت ساده */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="h-1 bg-green-500 rounded-full mt-4 mx-auto"
              style={{ maxWidth: 200 }}
            />
          </>
        )}

        {/* حالت: ناموفق */}
        {status === "failed" && (
          <>
            <FaTimesCircle className="text-6xl text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-600">پرداخت ناموفق</h2>
            <p className="text-gray-500 mt-2 mb-6">
              متأسفانه پرداخت شما با مشکل مواجه شد.
              <br />
              لطفاً مجدداً تلاش کنید.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push("/confirm")}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold 
                           hover:bg-blue-700 transition-colors"
              >
                تلاش مجدد
              </button>
              <button
                onClick={() => router.push("/")}
                className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
              >
                بازگشت به صفحه اصلی
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
