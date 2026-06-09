"use client";
import { useState } from "react";

export default function TestPaymentPage() {
  const [loading, setLoading] = useState(false);

  const simulatePayment = async () => {
    setLoading(true);
    // پارامترهای واقعی را از session یا localStorage بگیرید
    const params = new URLSearchParams({
      chargeId: "YOUR_CHARGE_ID_HERE",
      purchaseId: "YOUR_PURCHASE_ID_HERE",
      telegramId: "USER_TELEGRAM_ID",
      description: "پرداخت تست",
    });
    const url = `/api/payment/verify-chargetest?${params.toString()}`;
    window.location.href = url;
  };

  return (
    <div className="p-8 text-center">
      <button
        onClick={simulatePayment}
        disabled={loading}
        className="bg-green-600 text-white px-6 py-3 rounded-xl"
      >
        {loading ? "در حال پردازش..." : "شبیه‌سازی پرداخت موفق"}
      </button>
    </div>
  );
}
