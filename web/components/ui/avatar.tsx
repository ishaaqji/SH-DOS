import { initials } from "@/lib/nav";

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span className={["avatar", size === "sm" ? "avatar-sm" : ""].filter(Boolean).join(" ")} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
