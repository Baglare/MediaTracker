import { Activity } from "lucide-react";
import ActivityLogPanel from "@/components/activity-log-panel";
import PageHeader from "@/components/page-header";
import type { ProgressLog } from "@/lib/types";

export default function ActivityFeature({ progressLogs }: { progressLogs: ProgressLog[] }) {
  return (
    <div>
      <PageHeader
        icon={Activity}
        title="Aktivite"
        subtitle="İlerleme ve durum kayıtlarının zaman çizelgesi"
      />
      <ActivityLogPanel progressLogs={progressLogs} />
    </div>
  );
}
