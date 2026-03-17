CREATE OR REPLACE FUNCTION public.cleanup_campaign_action_items_on_delete(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.action_items
  SET module_id = NULL,
      archived_at = COALESCE(archived_at, now()),
      updated_at = now()
  WHERE module_type = 'campaigns'
    AND module_id = _campaign_id;
END;
$$;