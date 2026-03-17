import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActionItems, ActionItem, CreateActionItemInput } from '@/hooks/useActionItems';
import { ActionItemModal } from '@/components/ActionItemModal';
import { format, isBefore, startOfDay } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';

const STORAGE_PREFIX = 'tasks-popup-dismissed-';
const SESSION_KEY = 'tasks-popup-shown-session';

const priorityColor: Record<string, string> = {
  High: 'bg-destructive/10 text-destructive border-destructive/20',
  Medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  Low: 'bg-muted text-muted-foreground border-border',
};

export function TodaysTasksPopup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const { updateActionItem, createActionItem } = useActionItems();

  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [editingItem, setEditingItem] = useState<ActionItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const dismissedForDay = localStorage.getItem(`${STORAGE_PREFIX}${todayKey}`);
    const shownThisSession = sessionStorage.getItem(SESSION_KEY);
    if (!dismissedForDay && !shownThisSession) {
      setOpen(true);
      sessionStorage.setItem(SESSION_KEY, 'true');
    }
  }, [user, todayKey]);

  const { data: tasks = [], refetch } = useQuery({
    queryKey: ['todays-agenda-popup', todayKey, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .lte('due_date', todayKey)
        .not('status', 'in', '("Completed","Cancelled")')
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .order('due_date', { ascending: true })
        .order('due_time', { ascending: true, nullsFirst: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as ActionItem[];
    },
    enabled: !!user && open,
  });

  const today = startOfDay(new Date());
  const overdueTasks = tasks.filter(
    (t) => t.due_date && isBefore(new Date(t.due_date), today)
  );
  const todayTasks = tasks.filter((t) => t.due_date === todayKey);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(`${STORAGE_PREFIX}${todayKey}`, 'true');
    }
    setOpen(false);
  };

  const handleViewAll = () => {
    if (dontShowAgain) {
      localStorage.setItem(`${STORAGE_PREFIX}${todayKey}`, 'true');
    }
    setOpen(false);
    navigate('/action-items');
  };

  const handleTaskClick = (task: ActionItem) => {
    setEditingItem(task);
    setEditModalOpen(true);
  };

  const handleSave = useCallback(async (data: CreateActionItemInput) => {
    if (editingItem) {
      await updateActionItem({ id: editingItem.id, ...data });
    } else {
      await createActionItem(data);
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: ['action_items'] });
  }, [editingItem, updateActionItem, createActionItem, refetch, queryClient]);

  if (!user) return null;

  const totalCount = overdueTasks.length + todayTasks.length;

  const renderTaskRow = (task: ActionItem, isOverdue: boolean) => (
    <div
      key={task.id}
      onClick={() => handleTaskClick(task)}
      className="px-5 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors cursor-pointer group"
    >
      <div
        className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
          task.priority === 'High'
            ? 'bg-destructive'
            : task.priority === 'Medium'
            ? 'bg-yellow-500'
            : 'bg-muted-foreground'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 ${priorityColor[task.priority] || ''}`}
          >
            {task.priority}
          </Badge>
          <span className="text-[10px] text-muted-foreground capitalize">
            {task.module_type}
          </span>
          {isOverdue && task.due_date && (
            <span className="text-[10px] text-destructive font-medium">
              Due {format(new Date(task.due_date), 'dd MMM')}
            </span>
          )}
          {task.due_time && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {task.due_time.slice(0, 5)}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="sm:max-w-[560px] p-0 gap-0 overflow-hidden border-primary/20 shadow-2xl"
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-primary/10">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shadow-sm">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-foreground">Today's Action Items</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(), 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
              {totalCount > 0 && (
                <Badge className="ml-auto text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/15">
                  {totalCount} item{totalCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {/* Task list or empty state */}
          <ScrollArea className="max-h-[420px]">
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-6">
                <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-base font-medium text-foreground">All caught up!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No tasks due today. Enjoy your day!
                </p>
              </div>
            ) : (
              <div>
                {/* Overdue section */}
                {overdueTasks.length > 0 && (
                  <>
                    <div className="px-5 py-2 bg-destructive/5 border-y border-destructive/10 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-xs font-semibold text-destructive uppercase tracking-wide">
                        Overdue ({overdueTasks.length})
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {overdueTasks.map((task) => renderTaskRow(task, true))}
                    </div>
                  </>
                )}

                {/* Today section */}
                {todayTasks.length > 0 && (
                  <>
                    <div className="px-5 py-2 bg-muted/40 border-y border-border flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                        Today ({todayTasks.length})
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {todayTasks.map((task) => renderTaskRow(task, false))}
                    </div>
                  </>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-border flex-row items-center justify-between sm:justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(v) => setDontShowAgain(!!v)}
              />
              <span className="text-xs text-muted-foreground">Don't show again today</span>
            </label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Dismiss
              </Button>
              <Button size="sm" onClick={handleViewAll}>
                View All Action Items
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <ActionItemModal
        open={editModalOpen}
        onOpenChange={(v) => {
          setEditModalOpen(v);
          if (!v) setEditingItem(null);
        }}
        actionItem={editingItem}
        onSave={handleSave}
      />
    </>
  );
}
