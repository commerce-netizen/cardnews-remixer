import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = { title: "로그인 · 돈작가 사진 생성기" };

export default function LoginPage() {
  return (
    <main className="page narrow">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
