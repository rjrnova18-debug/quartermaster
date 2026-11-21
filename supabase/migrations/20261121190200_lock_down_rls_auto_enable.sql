-- Quartermaster · security fix found by the Supabase security advisor (phase F2a)
--
-- The project option "Enable RLS on new tables automatically" installs the function
-- public.rls_auto_enable() as SECURITY DEFINER. Because it lives in the exposed `public`
-- schema, anyone could call it through /rest/v1/rpc/rls_auto_enable, even without
-- signing in. It is only meant to run as an internal event trigger, so nobody outside
-- the database needs to execute it.
--
-- Written defensively: a project created without that option has no such function.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
