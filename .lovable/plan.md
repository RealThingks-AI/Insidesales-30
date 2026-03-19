

## Campaign Audit Remediation: Action Item Logging + Audit Log UX Fixes

### Problem Analysis

**Bug 1 — "Completed action items not in logs"**: Investigation shows logs ARE being created in the database. The real issue is **double-logging** — both `useActionItems.tsx` (hook-level `onSuccess`) and `ActionItems.tsx` (page-level `handleStatusChange`) independently call `logUpdate`, creating duplicate audit entries. Some completions may also appear missing if the user completed items from a Deal or Contact view (where `useCRUDAudit` might not be wired). The double-logging also inflates stats.

**Bug 2 — Stats badges not clickable**: `AuditLogStats` renders `Total`, `Today`, `This Week`, and module badges as plain display badges with no `onClick` handlers. They should act as quick filters.

**Bug 3 — Summary text truncation**: The Summary `TableCell` uses the `truncate` CSS class, which clips long text with ellipsis. Text should wrap instead.

---

### Plan

#### 1. Fix double-logging of action item updates

**Files**: `src/pages/ActionItems.tsx`

Remove the redundant `logUpdate`, `logCreate`, `logDelete`, `logBulkUpdate`, `logBulkDelete` calls from the page-level handlers since `useActionItems.tsx` already logs all CRUD operations in its mutation `onSuccess` callbacks. Remove the `useCRUDAudit` import from the page.

Affected handlers: `handleStatusChange`, `handlePriorityChange`, `handleAssignedToChange`, `handleDueDateChange`, `handleBulkComplete`, `handleBulkDelete`, `handleSave`, `handleDelete`.

#### 2. Make stats badges clickable as filters

**Files**: `src/components/settings/audit/AuditLogStats.tsx`, `src/components/settings/AuditLogsSettings.tsx`

- Add callback props to `AuditLogStats`: `onFilterToday`, `onFilterThisWeek`, `onFilterAll`, `onFilterModule(moduleName)`.
- Wrap each badge in a clickable button/element. When clicked:
  - "Total" → clear all date/module filters (show all)
  - "Today" → set date preset to today
  - "This Week" → set date preset to this week
  - Module badges (Action Items, Deals, Contacts, etc.) → set module filter to that module
- Add visual active state to show which filter badge is currently selected.
- Wire callbacks in `AuditLogsSettings.tsx`.

#### 3. Fix summary text wrapping

**File**: `src/components/settings/AuditLogsSettings.tsx`

Change the Summary `TableCell` (line 323) from `truncate` to `break-words` / `whitespace-normal` so long summaries wrap within the cell instead of being clipped. Also set a `max-w` to keep it readable.

```
// Before
<TableCell className="py-1.5 text-xs truncate">

// After  
<TableCell className="py-1.5 text-xs whitespace-normal break-words max-w-[500px]">
```

---

### Technical Details

- **Double-log root cause**: `useActionItems` hook already calls `logCreate/logUpdate/logDelete/logBulkUpdate/logBulkDelete` in each mutation's `onSuccess`. The page then calls the same audit functions again after `await updateActionItem(...)` returns.
- **Stats badge wiring**: The parent `AuditLogsSettings` already holds `dateFrom`, `dateTo`, `moduleFilter` state. The callbacks will simply set those values using the existing `getDatePresets()` utility.
- No schema or migration changes needed.

