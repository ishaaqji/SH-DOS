import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="auth-shell">
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 className="auth-title">Page not found</h1>
        <p className="text-muted text-sm">
          The page you are looking for does not exist or has been moved.
        </p>
        <div style={{ marginTop: "1.25rem" }}>
          <Link href="/dashboard">
            <Button>Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
