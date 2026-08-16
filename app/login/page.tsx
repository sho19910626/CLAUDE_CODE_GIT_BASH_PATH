import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/indeed/LoginForm";

export const metadata: Metadata = {
  title: "ログイン — Indeed 求人診断",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
