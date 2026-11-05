BEGIN;

CREATE OR REPLACE FUNCTION public.chageun_admin_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_users jsonb; v_groups jsonb; v_archives jsonb; v_audit jsonb;
BEGIN
  PERFORM chageun_internal.admin_require();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'email',u.email,'nickname',coalesce(fp.nickname,'(별명 없음)'),
    'displayName',u.raw_user_meta_data->>'chageun_display_name',
    'friendCode',fp.friend_code,'createdAt',u.created_at,
    'isAdmin',(u.id=(SELECT a.user_id FROM public.chageun_admin_identity a WHERE a.singleton=1))
  ) ORDER BY u.created_at DESC),'[]'::jsonb) INTO v_users
  FROM auth.users u LEFT JOIN public.friend_profiles fp ON fp.user_id=u.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'name',g.name,'ownerId',g.owner_id,'createdAt',g.created_at,
    'members',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'userId',m.user_id,'nickname',fp.nickname,'joinedAt',m.joined_at,
      'status',m.status,'isOwner',(m.user_id=g.owner_id)
    ) ORDER BY (m.user_id<>g.owner_id),m.joined_at NULLS LAST),'[]'::jsonb)
      FROM public.study_group_members m JOIN public.friend_profiles fp ON fp.user_id=m.user_id
      WHERE m.group_id=g.id)
  ) ORDER BY g.created_at DESC),'[]'::jsonb) INTO v_groups FROM public.study_groups g;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',a.group_id,'name',a.name,'deletedAt',a.deleted_at,'expiresAt',a.expires_at,
    'memberCount',jsonb_array_length(a.members)
  ) ORDER BY a.deleted_at DESC),'[]'::jsonb) INTO v_archives
  FROM chageun_internal.group_archives a WHERE a.expires_at>now();

  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_audit FROM (
    SELECT jsonb_build_object('action',l.action,'reason',l.reason,'at',l.created_at,
      'targetUserId',l.target_user_id,'targetGroupId',l.target_group_id,'detail',l.detail) AS x
    FROM public.chageun_admin_audit l WHERE l.created_at>now()-interval '30 days'
    ORDER BY l.created_at DESC LIMIT 100
  ) recent;
  RETURN jsonb_build_object('users',v_users,'groups',v_groups,'archivedGroups',v_archives,'audit',v_audit);
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_set_display_name(
  p_user uuid, p_name text, p_expected text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := chageun_internal.admin_require();
  old_name text;
  new_name text := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
BEGIN
  IF p_user IS NULL OR p_user = actor THEN RAISE EXCEPTION '다른 회원을 선택해 주세요.'; END IF;
  IF new_name IS NULL OR char_length(new_name) NOT BETWEEN 1 AND 24 OR new_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION '표시 이름은 1~24자로 입력해 주세요.';
  END IF;
  IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION '조치 사유는 2~150자로 입력해 주세요.';
  END IF;
  SELECT raw_user_meta_data->>'chageun_display_name' INTO old_name
    FROM auth.users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '회원 계정을 찾을 수 없어요.'; END IF;
  IF old_name IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION '표시 이름이 바뀌었어요. 관리자 메뉴를 다시 열어 확인해 주세요.';
  END IF;
  IF old_name IS NOT DISTINCT FROM new_name THEN RETURN; END IF;
  UPDATE auth.users SET raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),
    '{chageun_display_name}',to_jsonb(new_name)), updated_at=now() WHERE id=p_user;
  PERFORM chageun_internal.admin_log(actor,'display_name_changed',btrim(p_reason),p_user,NULL,
    jsonb_build_object('before',old_name,'after',new_name));
  PERFORM chageun_internal.notify_user(p_user,'표시 이름 변경',
    format('전체 관리자가 설정 표시 이름을 %s(으)로 변경했습니다.',new_name));
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_admin_set_display_name(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_admin_set_display_name(uuid,text,text,text) TO authenticated;
COMMIT;
