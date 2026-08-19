"use client";

export default function LogoutButton() {
  return (
    <button
      type="button"
      className="session-logout"
      onClick={async () => {
        await fetch("/api/auth/login", { method: "DELETE" });
        location.href = "/login";
      }}
    >
      ログアウト
    </button>
  );
}
