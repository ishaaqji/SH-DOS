import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <ModulePlaceholder
      title="Analytics"
      description="Understand audience, engagement and publishing impact."
      milestone="M4.x"
    />
  );
}
