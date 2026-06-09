"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";

export default function PaymentSuccessPage() {
  const [isClosing, setIsClosing] = useState(false);
  const [isBaleEnv, setIsBaleEnv] = useState(false);

  useEffect(() => {
    localStorage.setItem("payment_success", "true");

    // تشخیص محیط بله
    const isBale = !!(window as any).Bale?.WebApp;
    setIsBaleEnv(isBale);

    // پاک کردن داده‌های موقت
    document.cookie = "selectedPlanId=; path=/; max-age=0; SameSite=Lax;";
    sessionStorage.removeItem("selectedPlanId");
    // signOut({ redirect: false });

    // ارسال پیام به والد (در صورت وجود)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage("payment_success", window.location.origin);
    }

    // اگر در محیط بله بود، بعد از 1.5 ثانیه ببند
    if (isBale) {
      const timer = setTimeout(() => {
        const baleWebApp = (window as any).Bale?.WebApp;
        if (baleWebApp?.close) {
          setIsClosing(true);
          baleWebApp.close();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    if (isBaleEnv) {
      const baleWebApp = (window as any).Bale?.WebApp;
      if (baleWebApp?.close) {
        setIsClosing(true);
        baleWebApp.close();
      }
    } else {
      // در مرورگر معمولی، فقط راهنمایی می‌کنیم
      alert(
        "لطفاً این صفحه را به صورت دستی ببندید (با کلیک روی × تب یا بستن مرورگر)",
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 dark:bg-gray-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center"
      >
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          پرداخت موفق
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          اشتراک شما با موفقیت فعال شد.
          {!isBaleEnv && <br />}
          {!isBaleEnv && (
            <span className="text-sm text-gray-500">
              در صورت عدم بسته شدن خودکار، لطفاً این صفحه را ببندید.
            </span>
          )}
        </p>
        <button
          onClick={handleClose}
          disabled={isClosing}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl transition disabled:opacity-50"
        >
          {isClosing ? "در حال بستن..." : "بستن صفحه"}
        </button>
      </motion.div>
    </div>
  );
}
