import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";

export interface DashboardData {
  deals: { stage: string; count: number }[];
  accounts: { status: string; count: number }[];
  contacts: { source: string; count: number }[];
  actionItems: { status: string; count: number }[];
  emailStats: { sent: number; opened: number; rate: number };
  todaysAgenda: { id: string; title: string; priority: string; due_time: string | null; module_type: string }[];
  recentActivities: { id: string; action: string; resource_type: string; resource_id: string | null; created_at: string; details: any }[];
  isAdmin: boolean;
}

export const useDashboardData = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  return useQuery({
    queryKey: ['dashboard-data', user?.id, isAdmin],
    queryFn: async (): Promise<DashboardData> => {
      if (!user) throw new Error('Not authenticated');

      // Use paginated fetching to avoid 1000-row Supabase limit
      const fetchAll = async (query: any) => {
        const PAGE_SIZE = 1000;
        let allData: any[] = [];
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          allData = [...allData, ...(data || [])];
          hasMore = (data?.length || 0) === PAGE_SIZE;
          from += PAGE_SIZE;
        }
        return allData;
      };

      // Build queries - admins see all, regular users see their own
      const dealsQuery = supabase.from('deals').select('stage');
      const accountsQuery = supabase.from('accounts').select('status');
      const contactsQuery = supabase.from('contacts').select('contact_source');
      const actionItemsQuery = supabase.from('action_items').select('status');
      const emailQuery = supabase.from('campaign_communications').select('email_status').eq('communication_type', 'email');

      // Apply user-specific filters for non-admins
      if (!isAdmin) {
        dealsQuery.eq('created_by', user.id);
        accountsQuery.eq('account_owner', user.id);
        contactsQuery.eq('contact_owner', user.id);
        actionItemsQuery.eq('assigned_to', user.id);
        emailQuery.eq('created_by', user.id);
      }

      const todayQuery = supabase.from('action_items')
        .select('id, title, priority, due_time, module_type')
        .eq('assigned_to', user.id)
        .eq('due_date', new Date().toISOString().split('T')[0])
        .neq('status', 'Completed')
        .neq('status', 'Cancelled')
        .order('due_time', { ascending: true })
        .limit(10);

      // Only fetch audit log for admins
      const activityQuery = isAdmin
        ? supabase.from('security_audit_log').select('id, action, resource_type, resource_id, created_at, details').order('created_at', { ascending: false }).limit(15)
        : Promise.resolve({ data: [], error: null });

      const [dealsData, accountsData, contactsData, actionItemsData, emailData, todayRes, activityRes] = await Promise.all([
        fetchAll(dealsQuery),
        fetchAll(accountsQuery),
        fetchAll(contactsQuery),
        fetchAll(actionItemsQuery),
        fetchAll(emailQuery),
        todayQuery,
        activityQuery,
      ]);

      // Process deals
      const dealStages = ['Lead', 'Discussions', 'Qualified', 'RFQ', 'Offered', 'Won', 'Lost', 'Dropped'];
      const dealCounts = dealStages.map(stage => ({
        stage,
        count: dealsData.filter((d: any) => d.stage === stage).length,
      }));

      // Process accounts - aligned with Accounts page filter options
      const accountStatuses = ['New', 'Working', 'Qualified', 'Inactive'];
      const accountCounts = accountStatuses.map(status => ({
        status,
        count: accountsData.filter((a: any) => (a.status || 'New') === status).length,
      }));

      // Process contacts
      const contactSources = ['Website', 'Referral', 'LinkedIn', 'Other'];
      const contactCounts = contactSources.map(source => {
        if (source === 'Other') {
          return {
            source,
            count: contactsData.filter((c: any) => !['Website', 'Referral', 'LinkedIn'].includes(c.contact_source || '')).length,
          };
        }
        return {
          source,
          count: contactsData.filter((c: any) => c.contact_source === source).length,
        };
      });

      // Process action items
      const actionStatuses = ['Open', 'In Progress', 'Completed', 'Cancelled'];
      const actionCounts = actionStatuses.map(status => ({
        status,
        count: actionItemsData.filter((a: any) => a.status === status).length,
      }));

      // Process email stats
      const sent = emailData.length;
      const opened = emailData.filter((e: any) => e.email_status === 'opened').length;

      return {
        deals: dealCounts,
        accounts: accountCounts,
        contacts: contactCounts,
        actionItems: actionCounts,
        emailStats: { sent, opened, rate: sent > 0 ? Math.round((opened / sent) * 100) : 0 },
        todaysAgenda: (todayRes.data || []) as DashboardData['todaysAgenda'],
        recentActivities: (activityRes.data || []) as DashboardData['recentActivities'],
        isAdmin,
      };
    },
    enabled: !!user && !roleLoading,
    staleTime: 30000,
    refetchInterval: 60000,
  });
};
