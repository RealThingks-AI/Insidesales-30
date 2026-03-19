import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuditLogStatsProps {
  total: number;
  todayCount: number;
  weekCount: number;
  byModule: Record<string, number>;
  byUser: Record<string, number>;
  userNames: Record<string, string>;
  activeFilter?: 'all' | 'today' | 'week' | string;
  onFilterAll?: () => void;
  onFilterToday?: () => void;
  onFilterThisWeek?: () => void;
  onFilterModule?: (moduleName: string) => void;
}

export const AuditLogStats = ({
  total, todayCount, weekCount, byModule,
  activeFilter = 'all',
  onFilterAll, onFilterToday, onFilterThisWeek, onFilterModule,
}: AuditLogStatsProps) => {
  const topModules = Object.entries(byModule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const base = "gap-1.5 text-xs font-medium py-1 cursor-pointer transition-all ring-offset-background";
  const activeRing = "ring-2 ring-primary ring-offset-1";

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <Badge
        variant="secondary"
        className={cn(base, activeFilter === 'all' && activeRing)}
        onClick={onFilterAll}
      >
        Total <span className="font-bold">{total}</span>
      </Badge>
      <Badge
        className={cn(base, "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-0", activeFilter === 'today' && activeRing)}
        onClick={onFilterToday}
      >
        Today <span className="font-bold">{todayCount}</span>
      </Badge>
      <Badge
        className={cn(base, "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0", activeFilter === 'week' && activeRing)}
        onClick={onFilterThisWeek}
      >
        This Week <span className="font-bold">{weekCount}</span>
      </Badge>
      <span className="text-muted-foreground text-xs">|</span>
      {topModules.map(([mod, count]) => (
        <Badge
          key={mod}
          variant="outline"
          className={cn(base, "font-normal", activeFilter === mod && activeRing)}
          onClick={() => onFilterModule?.(mod)}
        >
          {mod} <span className="font-bold">{count}</span>
        </Badge>
      ))}
    </div>
  );
};
