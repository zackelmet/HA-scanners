"use client";

import { useEffect, useState } from "react";
import { AuthProvider } from "./AuthContext";
import { SubscriptionModalProvider } from "./SubscriptionModalContext";
import { AuthService } from "../auth/AuthService";

const authService = new AuthService();

export default function ClientProviders({ children }: any) {
  const [ToasterComp, setToasterComp] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import("react-hot-toast");
        setToasterComp(() => mod.Toaster);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("react-hot-toast failed to load in ClientProviders:", err);
      }
    })();
  }, []);

  return (
    <AuthProvider authService={authService}>
      <SubscriptionModalProvider>
        {ToasterComp ? <ToasterComp /> : null}
        {children}
      </SubscriptionModalProvider>
    </AuthProvider>
  );
}
