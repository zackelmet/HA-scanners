"use client";

import { auth } from "@/lib/firebase/firebaseClient";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const showToast = (type: "error" | "success", message: string) => {
  import("react-hot-toast")
    .then((mod) => {
      const t = mod as any;
      if (type === "error") t.toast.error(message);
      else t.toast.success(message);
    })
    .catch(() => {});
};

export default function PasswordResetForm() {
  const [newPassword, setNewPassword] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const handlePasswordReset = async () => {
    if (!oobCode) {
      showToast("error", "Error resetting password: invalid code.");
      return;
    }

    try {
      // Verify the password reset code is valid
      await verifyPasswordResetCode(auth, oobCode as string);
      // If valid, update the password
      await confirmPasswordReset(auth, oobCode as string, newPassword);
      showToast("success", "Password has been reset successfully!");
      router.push("/"); // Redirect to login page
    } catch (error) {
      showToast("error", "Failed to reset password. Please try again.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-3 rounded-xl bg-white shadow-lg">
        <h1 className="text-xl font-bold text-center">Reset your password</h1>
        <input
          type="password"
          className="input input-bordered w-full"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button
          onClick={handlePasswordReset}
          className="btn btn-primary w-full"
        >
          Reset Password
        </button>
      </div>
    </div>
  );
}
