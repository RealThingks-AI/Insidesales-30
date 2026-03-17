import { ContactTable } from "@/components/ContactTable";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, MoreVertical, Upload, Plus, Trash2, Download, Search, X } from "lucide-react";
import { useState, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSimpleContactsImportExport } from "@/hooks/useSimpleContactsImportExport";
import { useCRUDAudit } from "@/hooks/useCRUDAudit";

const Contacts = () => {
  const { toast } = useToast();
  const { logBulkDelete } = useCRUDAudit();
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter state
  const [sourceFilter, setSourceFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const onRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const { handleImport, handleExport, isImporting } = useSimpleContactsImportExport(onRefresh);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await handleImport(file);
      event.target.value = '';
    } catch (error: any) {
      console.error('Contacts page: Import error caught:', error);
      event.target.value = '';
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.length === 0) return;
    setShowDeleteConfirm(false);
    try {
      // Clean up related records to avoid orphans
      await Promise.all([
        supabase.from('deal_stakeholders').delete().in('contact_id', selectedContacts),
        supabase.from('campaign_contacts').delete().in('contact_id', selectedContacts),
        // Null out stakeholder contact references in deals
        supabase.from('deals').update({ budget_owner_contact_id: null }).in('budget_owner_contact_id', selectedContacts),
        supabase.from('deals').update({ champion_contact_id: null }).in('champion_contact_id', selectedContacts),
        supabase.from('deals').update({ objector_contact_id: null }).in('objector_contact_id', selectedContacts),
        supabase.from('deals').update({ influencer_contact_id: null }).in('influencer_contact_id', selectedContacts),
      ]);

      const { error } = await supabase.from('contacts').delete().in('id', selectedContacts);
      if (error) throw error;

      await logBulkDelete('contacts', selectedContacts.length, selectedContacts);
      toast({
        title: "Success",
        description: `${selectedContacts.length} contacts deleted successfully`
      });
      setSelectedContacts([]);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete contacts",
        variant: "destructive"
      });
    }
  };

  const hasActiveFilters = sourceFilter !== 'all' || regionFilter !== 'all';

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (sourceFilter !== 'all') f.contact_source = sourceFilter;
    if (regionFilter !== 'all') f.region = regionFilter;
    return f;
  }, [sourceFilter, regionFilter]);

  const resetFilters = () => {
    setSourceFilter('all');
    setRegionFilter('all');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header - fixed height matching sidebar */}
      <div className="flex-shrink-0 h-16 border-b bg-background px-6 flex items-center">
        <div className="flex items-center justify-between w-full">
          <h1 className="text-2xl font-semibold text-foreground">Contacts</h1>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filter Bar - consistent padding and styling */}
      <div className="flex-shrink-0 border-b bg-muted/30 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search contacts..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="pl-9" 
            />
          </div>

          {/* Source Filter */}
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-auto min-w-[100px] [&>svg]:hidden">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="Website">Website</SelectItem>
              <SelectItem value="Referral">Referral</SelectItem>
              <SelectItem value="LinkedIn">LinkedIn</SelectItem>
              <SelectItem value="Trade Show">Trade Show</SelectItem>
              <SelectItem value="Cold Call">Cold Call</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>

          {/* Region Filter */}
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-auto min-w-[100px] [&>svg]:hidden">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="EU">EU</SelectItem>
              <SelectItem value="US">US</SelectItem>
              <SelectItem value="ASIA">ASIA</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="mr-1 h-4 w-4" />
              Clear Filters
            </Button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" disabled={isImporting}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowColumnCustomizer(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Columns
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImportClick} disabled={isImporting}>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              {selectedContacts.length > 0 && (
                <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Selected ({selectedContacts.length})
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Hidden file input for CSV import */}
      <input 
        ref={fileInputRef} 
        type="file" 
        accept=".csv" 
        onChange={handleImportCSV} 
        className="hidden" 
        disabled={isImporting} 
      />

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedContacts.length} Contact{selectedContacts.length !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected contacts will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContactTable 
          showColumnCustomizer={showColumnCustomizer} 
          setShowColumnCustomizer={setShowColumnCustomizer} 
          showModal={showModal} 
          setShowModal={setShowModal} 
          selectedContacts={selectedContacts} 
          setSelectedContacts={setSelectedContacts} 
          refreshTrigger={refreshTrigger}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filters={filters}
        />
      </div>
    </div>
  );
};

export default Contacts;
