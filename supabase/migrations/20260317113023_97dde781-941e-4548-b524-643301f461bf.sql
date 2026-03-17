-- Phase 1/2 foundation for Campaign module hardening

-- 1) Add missing core campaign fields and archive metadata
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS goal text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON public.campaigns(owner);
CREATE INDEX IF NOT EXISTS idx_campaigns_archived_at ON public.campaigns(archived_at);

-- 2) Add a durable source link for deal conversion duplicate protection
ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS source_campaign_contact_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deals_source_campaign_contact_id_fkey'
  ) THEN
    ALTER TABLE public.deals
    ADD CONSTRAINT deals_source_campaign_contact_id_fkey
    FOREIGN KEY (source_campaign_contact_id)
    REFERENCES public.campaign_contacts(id)
    ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_source_campaign_contact_unique
ON public.deals(source_campaign_contact_id)
WHERE source_campaign_contact_id IS NOT NULL;

-- 3) Server-side validation for campaigns
CREATE OR REPLACE FUNCTION public.validate_campaign_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.campaign_name := btrim(COALESCE(NEW.campaign_name, ''));

  IF NEW.campaign_name = '' THEN
    RAISE EXCEPTION 'Campaign name is required';
  END IF;

  IF char_length(NEW.campaign_name) > 150 THEN
    RAISE EXCEPTION 'Campaign name must be 150 characters or fewer';
  END IF;

  IF NEW.goal IS NOT NULL AND char_length(NEW.goal) > 1000 THEN
    RAISE EXCEPTION 'Goal must be 1000 characters or fewer';
  END IF;

  IF NEW.notes IS NOT NULL AND char_length(NEW.notes) > 5000 THEN
    RAISE EXCEPTION 'Notes must be 5000 characters or fewer';
  END IF;

  IF NEW.description IS NOT NULL AND char_length(NEW.description) > 2000 THEN
    RAISE EXCEPTION 'Description must be 2000 characters or fewer';
  END IF;

  IF NEW.message_strategy IS NOT NULL AND char_length(NEW.message_strategy) > 3000 THEN
    RAISE EXCEPTION 'Message strategy must be 3000 characters or fewer';
  END IF;

  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.start_date > NEW.end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_campaign_record_trigger ON public.campaigns;
CREATE TRIGGER validate_campaign_record_trigger
BEFORE INSERT OR UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.validate_campaign_record();

-- 4) Security-definer helpers for campaign access control
CREATE OR REPLACE FUNCTION public.can_view_campaign(_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = _campaign_id
      AND (
        public.is_current_user_admin()
        OR c.created_by = auth.uid()
        OR c.owner = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_campaign(_campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = _campaign_id
      AND (
        public.is_current_user_admin()
        OR c.created_by = auth.uid()
        OR c.owner = auth.uid()
      )
  );
$$;

-- 5) Harden campaign table RLS around creator/owner/admin access
DROP POLICY IF EXISTS "Authenticated users can view all campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Creator or admin can update campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Creator or admin can delete campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert campaigns" ON public.campaigns;

CREATE POLICY "Users can view owned campaigns"
ON public.campaigns
FOR SELECT
TO authenticated
USING (public.can_view_campaign(id));

CREATE POLICY "Users can insert campaigns"
ON public.campaigns
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can manage owned campaigns"
ON public.campaigns
FOR UPDATE
TO authenticated
USING (public.can_manage_campaign(id))
WITH CHECK (public.can_manage_campaign(id));

CREATE POLICY "Users can delete owned campaigns"
ON public.campaigns
FOR DELETE
TO authenticated
USING (public.can_manage_campaign(id));

-- 6) Harden campaign child tables to inherit campaign visibility/management
DROP POLICY IF EXISTS "Authenticated users can view campaign accounts" ON public.campaign_accounts;
DROP POLICY IF EXISTS "Creator or admin can update campaign accounts" ON public.campaign_accounts;
DROP POLICY IF EXISTS "Creator or admin can delete campaign accounts" ON public.campaign_accounts;
DROP POLICY IF EXISTS "Users can insert campaign accounts" ON public.campaign_accounts;

CREATE POLICY "Users can view accessible campaign accounts"
ON public.campaign_accounts
FOR SELECT
TO authenticated
USING (public.can_view_campaign(campaign_id));

CREATE POLICY "Users can insert accessible campaign accounts"
ON public.campaign_accounts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can update accessible campaign accounts"
ON public.campaign_accounts
FOR UPDATE
TO authenticated
USING (public.can_manage_campaign(campaign_id))
WITH CHECK (public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can delete accessible campaign accounts"
ON public.campaign_accounts
FOR DELETE
TO authenticated
USING (public.can_manage_campaign(campaign_id));

DROP POLICY IF EXISTS "Authenticated users can view campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Creator or admin can update campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Creator or admin can delete campaign contacts" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Users can insert campaign contacts" ON public.campaign_contacts;

CREATE POLICY "Users can view accessible campaign contacts"
ON public.campaign_contacts
FOR SELECT
TO authenticated
USING (public.can_view_campaign(campaign_id));

CREATE POLICY "Users can insert accessible campaign contacts"
ON public.campaign_contacts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can update accessible campaign contacts"
ON public.campaign_contacts
FOR UPDATE
TO authenticated
USING (public.can_manage_campaign(campaign_id))
WITH CHECK (public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can delete accessible campaign contacts"
ON public.campaign_contacts
FOR DELETE
TO authenticated
USING (public.can_manage_campaign(campaign_id));

DROP POLICY IF EXISTS "Authenticated users can view campaign communications" ON public.campaign_communications;
DROP POLICY IF EXISTS "Creator or admin can update campaign communications" ON public.campaign_communications;
DROP POLICY IF EXISTS "Creator or admin can delete campaign communications" ON public.campaign_communications;
DROP POLICY IF EXISTS "Users can insert campaign communications" ON public.campaign_communications;

CREATE POLICY "Users can view accessible campaign communications"
ON public.campaign_communications
FOR SELECT
TO authenticated
USING (public.can_view_campaign(campaign_id));

CREATE POLICY "Users can insert accessible campaign communications"
ON public.campaign_communications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can update accessible campaign communications"
ON public.campaign_communications
FOR UPDATE
TO authenticated
USING (public.can_manage_campaign(campaign_id))
WITH CHECK (public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can delete accessible campaign communications"
ON public.campaign_communications
FOR DELETE
TO authenticated
USING (public.can_manage_campaign(campaign_id));

DROP POLICY IF EXISTS "Authenticated users can view campaign email templates" ON public.campaign_email_templates;
DROP POLICY IF EXISTS "Creator or admin can update campaign email templates" ON public.campaign_email_templates;
DROP POLICY IF EXISTS "Creator or admin can delete campaign email templates" ON public.campaign_email_templates;
DROP POLICY IF EXISTS "Users can insert campaign email templates" ON public.campaign_email_templates;

CREATE POLICY "Users can view accessible campaign email templates"
ON public.campaign_email_templates
FOR SELECT
TO authenticated
USING (campaign_id IS NULL OR public.can_view_campaign(campaign_id));

CREATE POLICY "Users can insert accessible campaign email templates"
ON public.campaign_email_templates
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND (campaign_id IS NULL OR public.can_manage_campaign(campaign_id)));

CREATE POLICY "Users can update accessible campaign email templates"
ON public.campaign_email_templates
FOR UPDATE
TO authenticated
USING (campaign_id IS NULL OR public.can_manage_campaign(campaign_id))
WITH CHECK (campaign_id IS NULL OR public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can delete accessible campaign email templates"
ON public.campaign_email_templates
FOR DELETE
TO authenticated
USING (campaign_id IS NULL OR public.can_manage_campaign(campaign_id));

DROP POLICY IF EXISTS "Authenticated users can view campaign phone scripts" ON public.campaign_phone_scripts;
DROP POLICY IF EXISTS "Creator or admin can update campaign phone scripts" ON public.campaign_phone_scripts;
DROP POLICY IF EXISTS "Creator or admin can delete campaign phone scripts" ON public.campaign_phone_scripts;
DROP POLICY IF EXISTS "Users can insert campaign phone scripts" ON public.campaign_phone_scripts;

CREATE POLICY "Users can view accessible campaign phone scripts"
ON public.campaign_phone_scripts
FOR SELECT
TO authenticated
USING (campaign_id IS NULL OR public.can_view_campaign(campaign_id));

CREATE POLICY "Users can insert accessible campaign phone scripts"
ON public.campaign_phone_scripts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND (campaign_id IS NULL OR public.can_manage_campaign(campaign_id)));

CREATE POLICY "Users can update accessible campaign phone scripts"
ON public.campaign_phone_scripts
FOR UPDATE
TO authenticated
USING (campaign_id IS NULL OR public.can_manage_campaign(campaign_id))
WITH CHECK (campaign_id IS NULL OR public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can delete accessible campaign phone scripts"
ON public.campaign_phone_scripts
FOR DELETE
TO authenticated
USING (campaign_id IS NULL OR public.can_manage_campaign(campaign_id));

DROP POLICY IF EXISTS "Authenticated users can view campaign materials" ON public.campaign_materials;
DROP POLICY IF EXISTS "Creator or admin can update campaign materials" ON public.campaign_materials;
DROP POLICY IF EXISTS "Creator or admin can delete campaign materials" ON public.campaign_materials;
DROP POLICY IF EXISTS "Users can insert campaign materials" ON public.campaign_materials;

CREATE POLICY "Users can view accessible campaign materials"
ON public.campaign_materials
FOR SELECT
TO authenticated
USING (public.can_view_campaign(campaign_id));

CREATE POLICY "Users can insert accessible campaign materials"
ON public.campaign_materials
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by AND public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can update accessible campaign materials"
ON public.campaign_materials
FOR UPDATE
TO authenticated
USING (public.can_manage_campaign(campaign_id))
WITH CHECK (public.can_manage_campaign(campaign_id));

CREATE POLICY "Users can delete accessible campaign materials"
ON public.campaign_materials
FOR DELETE
TO authenticated
USING (public.can_manage_campaign(campaign_id));

-- 7) Tighten direct notification creation from clients
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert their own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 8) Normalize a few security-sensitive functions with fixed search_path
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, theme)
  VALUES (NEW.id, 'auto')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(p_action text, p_resource_type text, p_resource_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address
  ) VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    inet_client_addr()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_data_access(p_table_name text, p_operation text, p_record_id text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address
  ) VALUES (
    auth.uid(),
    p_operation,
    p_table_name,
    p_record_id,
    jsonb_build_object(
      'operation', p_operation,
      'table', p_table_name,
      'timestamp', NOW()
    ),
    inet_client_addr()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_admin(auth.uid());
$$;