GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_clients TO authenticated; GRANT ALL ON public.agent_clients TO service_role;

-- Backfill: link existing invited orgs to the agent that invited them where possible.
-- For now, since there is no tracking column, we cannot auto-assign; admins can do it manually.