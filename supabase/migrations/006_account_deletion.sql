BEGIN;
CREATE OR REPLACE FUNCTION public.chageun_delete_account(p_user uuid,p_email text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); target_email text; owned record; successor uuid;
BEGIN
  IF actor IS NULL OR p_user IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
  IF actor <> p_user THEN PERFORM chageun_internal.admin_require(); END IF;
  IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION '사유를 입력해 주세요.'; END IF;
  SELECT email INTO target_email FROM auth.users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND OR target_email IS NULL OR lower(trim(p_email)) IS DISTINCT FROM lower(target_email)
    THEN RAISE EXCEPTION '계정 이메일을 확인해 주세요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.chageun_admin_identity WHERE user_id=p_user)
    THEN RAISE EXCEPTION '전체 관리자 계정은 삭제할 수 없어요.'; END IF;
  LOCK TABLE public.study_groups, public.study_group_members IN SHARE ROW EXCLUSIVE MODE;
  FOR owned IN SELECT id FROM public.study_groups WHERE owner_id=p_user ORDER BY id LOOP
    SELECT user_id INTO successor FROM public.study_group_members
      WHERE group_id=owned.id AND status='accepted' AND user_id<>p_user
      ORDER BY joined_at NULLS LAST,created_at,user_id LIMIT 1;
    IF successor IS NOT NULL THEN
      UPDATE public.study_groups SET owner_id=successor WHERE id=owned.id;
    END IF;
    -- With no accepted successor, the owner FK removes the empty group and pending invitations.
  END LOOP;
  UPDATE chageun_internal.group_archives a SET members=(
    SELECT coalesce(jsonb_agg(CASE WHEN member->>'invited_by'=p_user::text
      THEN member-'invited_by' ELSE member END ORDER BY position),'[]'::jsonb)
    FROM jsonb_array_elements(a.members) WITH ORDINALITY AS m(member,position)
    WHERE member->>'user_id' IS DISTINCT FROM p_user::text
  ) WHERE members @> jsonb_build_array(jsonb_build_object('user_id',p_user))
       OR members @> jsonb_build_array(jsonb_build_object('invited_by',p_user));
  DELETE FROM chageun_internal.workspace_precleanup_backup WHERE user_id=p_user;
  IF actor<>p_user THEN PERFORM chageun_internal.admin_log(actor,'account_deleted',p_reason,p_user); END IF;
  DELETE FROM auth.users WHERE id=p_user;
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_delete_account(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_delete_account(uuid,text,text) TO authenticated;
COMMIT;
