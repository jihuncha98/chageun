-- 차근 2.0 관리자 1차 통합 설치
-- 전제: 기존 friends(002), groups(003) SQL 설치. 관리자 계정은 아직 지정하지 않습니다.
-- 차근 공부 데이터, 공부 기록, 현재 그룹을 삭제하거나 초기화하지 않습니다.
BEGIN;
CREATE SCHEMA IF NOT EXISTS chageun_internal;
REVOKE ALL ON SCHEMA chageun_internal FROM PUBLIC, anon, authenticated;

-- 정확히 1개의 관리자 계정. 설치 후 002_assign_admin.sql에서 계정 지정.
CREATE TABLE IF NOT EXISTS public.chageun_admin_identity (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK(singleton=1),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chageun_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_group_id uuid,
  reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chageun_admin_audit_time ON public.chageun_admin_audit(created_at DESC);
CREATE TABLE IF NOT EXISTS public.chageun_admin_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS chageun_admin_notices_user_time ON public.chageun_admin_notices(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.chageun_chat_restrictions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);
-- 그룹 삭제를 물리적으로 별도 보관하고 7일 내 복구. 운영 테이블에서는 즉시 사라짐.
CREATE TABLE IF NOT EXISTS chageun_internal.group_archives (
  group_id uuid PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid NOT NULL,
  original_created_at timestamptz NOT NULL,
  members jsonb NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT(now() + interval '7 days')
);

ALTER TABLE public.chageun_admin_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chageun_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chageun_admin_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chageun_chat_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chageun_internal.group_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chageun_admin_identity, public.chageun_admin_audit,
  public.chageun_admin_notices, public.chageun_chat_restrictions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON chageun_internal.group_archives FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.chageun_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chageun_admin_identity a
    JOIN auth.users u ON u.id = a.user_id
    WHERE a.singleton=1 AND a.user_id=(SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION chageun_internal.admin_require()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.chageun_is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 없습니다.';
  END IF;
  RETURN me;
END;
$$;

CREATE OR REPLACE FUNCTION chageun_internal.admin_log(p_actor uuid,p_action text,p_reason text,p_user uuid DEFAULT NULL,p_group uuid DEFAULT NULL,p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.chageun_admin_audit(admin_id,action,target_user_id,target_group_id,reason,detail)
  VALUES(p_actor,p_action,p_user,p_group,p_reason,coalesce(p_detail,'{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION chageun_internal.notify_user(p_user uuid,p_title text,p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
    INSERT INTO public.chageun_admin_notices(user_id,title,body) VALUES(p_user,p_title,p_body);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_users jsonb; v_groups jsonb; v_archives jsonb; v_audit jsonb;
BEGIN
  PERFORM chageun_internal.admin_require();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'email',u.email,'nickname',coalesce(fp.nickname,'(별명 없음)'),
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

CREATE OR REPLACE FUNCTION public.chageun_admin_set_nickname(p_user uuid,p_nickname text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid; old_name text;
BEGIN
  me:=chageun_internal.admin_require();
  IF p_user IS NULL OR p_user=me THEN RAISE EXCEPTION '대상을 다시 선택해 주세요.'; END IF;
  IF p_nickname IS NULL OR char_length(trim(p_nickname)) NOT BETWEEN 2 AND 20 THEN
    RAISE EXCEPTION '친구 별명은 2~20자로 입력해 주세요.';
  END IF;
  IF length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '변경 사유를 입력해 주세요.'; END IF;
  SELECT nickname INTO old_name FROM public.friend_profiles WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '친구 프로필이 없는 계정이에요.'; END IF;
  UPDATE public.friend_profiles SET nickname=trim(p_nickname) WHERE user_id=p_user;
  PERFORM chageun_internal.admin_log(me,'nickname_changed',p_reason,p_user,NULL,
    jsonb_build_object('before',old_name,'after',trim(p_nickname)));
  PERFORM chageun_internal.notify_user(p_user,'친구 별명 변경',
    format('전체 관리자가 친구 별명을 %s(으)로 변경했습니다.',trim(p_nickname)));
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_remove_member(p_group uuid,p_user uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid; removed integer;
BEGIN
  me:=chageun_internal.admin_require();
  IF length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '조치 사유를 입력해 주세요.'; END IF;
  IF EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group AND owner_id=p_user) THEN
    RAISE EXCEPTION '그룹 관리자부터 다른 구성원으로 변경한 후 강제 탈퇴 처리해 주세요.';
  END IF;
  DELETE FROM public.study_group_members WHERE group_id=p_group AND user_id=p_user;
  GET DIAGNOSTICS removed=ROW_COUNT;
  IF removed<>1 THEN RAISE EXCEPTION '해당 그룹원을 찾을 수 없어요.'; END IF;
  PERFORM chageun_internal.admin_log(me,'group_member_removed',p_reason,p_user,p_group);
  PERFORM chageun_internal.notify_user(p_user,'그룹 강제 탈퇴',
    '전체 관리자에 의해 그룹에서 탈퇴 처리되었습니다. 새로운 초대를 받으면 다시 가입할 수 있습니다.');
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_transfer_owner(p_group uuid,p_new_owner uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid; old_owner uuid; group_name text;
BEGIN
  me:=chageun_internal.admin_require();
  IF length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '변경 사유를 입력해 주세요.'; END IF;
  SELECT owner_id,name INTO old_owner,group_name FROM public.study_groups WHERE id=p_group FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '그룹이 없어요.'; END IF;
  IF old_owner=p_new_owner OR NOT EXISTS(
    SELECT 1 FROM public.study_group_members WHERE group_id=p_group AND user_id=p_new_owner AND status='accepted'
  ) THEN RAISE EXCEPTION '현재 그룹에 참여 중인 다른 구성원을 선택해 주세요.'; END IF;
  UPDATE public.study_groups SET owner_id=p_new_owner WHERE id=p_group;
  PERFORM chageun_internal.admin_log(me,'group_owner_changed',p_reason,p_new_owner,p_group,
    jsonb_build_object('oldOwner',old_owner));
  PERFORM chageun_internal.notify_user(old_owner,'그룹 관리자 변경',format('%s 그룹의 관리자 권한이 이전되었습니다.',group_name));
  PERFORM chageun_internal.notify_user(p_new_owner,'그룹 관리자 지정',format('%s 그룹의 관리자로 지정되었습니다.',group_name));
END;
$$;

-- 내부 그룹 보관 프로시저: 일반 RPC로 직접 실행할 권한 없음.
CREATE OR REPLACE FUNCTION chageun_internal.archive_group(p_group uuid,p_actor uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.study_groups; mem jsonb;
BEGIN
  SELECT * INTO g FROM public.study_groups WHERE id=p_group FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '삭제할 그룹을 찾을 수 없어요.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,'invited_by',m.invited_by,'status',m.status,
    'created_at',m.created_at,'joined_at',m.joined_at
  ) ORDER BY m.created_at),'[]'::jsonb) INTO mem
  FROM public.study_group_members m WHERE m.group_id=p_group;
  INSERT INTO chageun_internal.group_archives(group_id,name,owner_id,original_created_at,members,deleted_by)
  VALUES(g.id,g.name,g.owner_id,g.created_at,mem,p_actor);
  DELETE FROM public.study_groups WHERE id=p_group;
  RETURN g.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_delete_group(p_group uuid,p_confirm_name text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid; group_name text; member_id uuid;
BEGIN
  me:=chageun_internal.admin_require();
  IF length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '삭제 사유를 입력해 주세요.'; END IF;
  SELECT name INTO group_name FROM public.study_groups WHERE id=p_group;
  IF NOT FOUND OR p_confirm_name IS DISTINCT FROM group_name THEN
    RAISE EXCEPTION '그룹 이름을 정확히 다시 입력해 주세요.';
  END IF;
  FOR member_id IN SELECT user_id FROM public.study_group_members
    WHERE group_id=p_group AND status='accepted'
  LOOP
    PERFORM chageun_internal.notify_user(member_id,'그룹 삭제',
      format('%s 그룹이 삭제되었습니다. 7일 안에 전체 관리자가 복구할 수 있습니다.',group_name));
  END LOOP;
  PERFORM chageun_internal.archive_group(p_group,me);
  PERFORM chageun_internal.admin_log(me,'group_archived',p_reason,NULL,p_group,
    jsonb_build_object('groupName',group_name));
END;
$$;

-- 기존 그룹 관리자도 그룹을 삭제하면 동일한 7일 보관 정책 적용.
CREATE OR REPLACE FUNCTION public.group_delete(p_group uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid:=auth.uid(); g_name text; member_id uuid;
BEGIN
  IF me IS NULL OR NOT EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group AND owner_id=me) THEN
    RAISE EXCEPTION '그룹 관리자만 그룹을 삭제할 수 있어요.';
  END IF;
  SELECT name INTO g_name FROM public.study_groups WHERE id=p_group;
  FOR member_id IN SELECT user_id FROM public.study_group_members WHERE group_id=p_group AND status='accepted' LOOP
    PERFORM chageun_internal.notify_user(member_id,'그룹 삭제',
      format('%s 그룹이 삭제되었습니다. 전체 관리자에게 7일 이내 복구를 요청할 수 있습니다.',g_name));
  END LOOP;
  PERFORM chageun_internal.archive_group(p_group,me);
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_restore_group(p_group uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid; a chageun_internal.group_archives; selected_owner uuid; candidate record; member_id uuid;
BEGIN
  me:=chageun_internal.admin_require();
  IF length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '복구 사유를 입력해 주세요.'; END IF;
  SELECT * INTO a FROM chageun_internal.group_archives
    WHERE group_id=p_group AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '복구할 수 있는 그룹이 없거나 7일이 지났어요.'; END IF;
  SELECT x.user_id INTO selected_owner
  FROM jsonb_to_recordset(a.members) AS x(user_id uuid, status text, joined_at timestamptz, created_at timestamptz)
  JOIN public.friend_profiles f ON f.user_id=x.user_id
  WHERE x.status='accepted'
  ORDER BY (x.user_id<>a.owner_id), x.joined_at NULLS LAST,x.created_at,x.user_id LIMIT 1;
  IF selected_owner IS NULL THEN RAISE EXCEPTION '복구 가능한 그룹원이 없어요.'; END IF;
  INSERT INTO public.study_groups(id,name,owner_id,created_at)
  VALUES(a.group_id,a.name,selected_owner,a.original_created_at);
  INSERT INTO public.study_group_members(group_id,user_id,invited_by,status,created_at,joined_at)
  SELECT a.group_id,x.user_id,CASE WHEN f2.user_id IS NOT NULL THEN x.invited_by ELSE NULL END,
         x.status,x.created_at,x.joined_at
  FROM jsonb_to_recordset(a.members) AS x(
    user_id uuid,invited_by uuid,status text,created_at timestamptz,joined_at timestamptz
  ) JOIN public.friend_profiles f ON f.user_id=x.user_id
  LEFT JOIN public.friend_profiles f2 ON f2.user_id=x.invited_by;
  DELETE FROM chageun_internal.group_archives WHERE group_id=p_group;
  PERFORM chageun_internal.admin_log(me,'group_restored',p_reason,NULL,p_group,
    jsonb_build_object('groupName',a.name));
  FOR member_id IN SELECT user_id FROM public.study_group_members
    WHERE group_id=p_group AND status='accepted'
  LOOP
    PERFORM chageun_internal.notify_user(member_id,'그룹 복구',format('%s 그룹이 복구되었습니다.',a.name));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_admin_chat_limit(p_user uuid,p_minutes integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid;
BEGIN
  me:=chageun_internal.admin_require();
  IF p_user IS NULL OR p_user=me OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN
    RAISE EXCEPTION '대상 회원을 확인해 주세요.';
  END IF;
  IF p_minutes NOT IN (0,5,30,60,1440) THEN RAISE EXCEPTION '제한 기간이 올바르지 않아요.'; END IF;
  IF length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '조치 사유를 입력해 주세요.'; END IF;
  IF p_minutes=0 THEN
    DELETE FROM public.chageun_chat_restrictions WHERE user_id=p_user;
  ELSE
    INSERT INTO public.chageun_chat_restrictions(user_id,ends_at,reason)
    VALUES(p_user,now() + make_interval(mins=>p_minutes),p_reason)
    ON CONFLICT(user_id) DO UPDATE SET ends_at=excluded.ends_at,reason=excluded.reason,issued_at=now();
  END IF;
  PERFORM chageun_internal.admin_log(me,CASE WHEN p_minutes=0 THEN 'chat_unlimited' ELSE 'chat_limited' END,
    p_reason,p_user,NULL,jsonb_build_object('minutes',p_minutes));
  PERFORM chageun_internal.notify_user(p_user,'그룹 채팅 이용 제한',
    CASE WHEN p_minutes=0 THEN '전체 관리자가 채팅 제한을 해제했습니다.'
         ELSE format('전체 관리자가 그룹 채팅을 %s분간 제한했습니다.',p_minutes) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_my_admin_notices()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid:=auth.uid(); notices jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'body',body,'createdAt',created_at,'readAt',read_at
  ) ORDER BY created_at DESC),'[]'::jsonb) INTO notices
  FROM public.chageun_admin_notices WHERE user_id=me AND created_at>now()-interval '7 days';
  RETURN notices;
END;
$$;

CREATE OR REPLACE FUNCTION public.chageun_mark_admin_notice_read(p_notice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
  UPDATE public.chageun_admin_notices SET read_at=coalesce(read_at,now())
  WHERE id=p_notice AND user_id=auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION chageun_internal.cleanup_admin_history()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.chageun_admin_notices WHERE created_at<=now()-interval '7 days';
  DELETE FROM public.chageun_admin_audit WHERE created_at<=now()-interval '30 days';
  DELETE FROM chageun_internal.group_archives WHERE expires_at<=now();
  DELETE FROM public.chageun_chat_restrictions WHERE ends_at<=now();
END;
$$;

-- 기본 EXECUTE는 공개될 수 있으므로 모든 민감 RPC를 명시적으로 제한합니다.
REVOKE ALL ON FUNCTION chageun_internal.admin_require() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION chageun_internal.admin_log(uuid,text,text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION chageun_internal.notify_user(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION chageun_internal.archive_group(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION chageun_internal.cleanup_admin_history() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.chageun_is_admin() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_dashboard() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_set_nickname(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_remove_member(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_transfer_owner(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_delete_group(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.group_delete(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_restore_group(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_admin_chat_limit(uuid,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_my_admin_notices() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.chageun_mark_admin_notice_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_set_nickname(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_remove_member(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_transfer_owner(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_delete_group(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_restore_group(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_admin_chat_limit(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_my_admin_notices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_mark_admin_notice_read(uuid) TO authenticated;
COMMIT;

-- 이미 1.14에서 사용한 pg_cron이 있는 경우 보관 기간 자동 정리를 설치합니다.
-- SQL 편집기에서 postgres 권한으로 실행되어야 합니다.
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    PERFORM cron.schedule('chageun-admin-retention','0 16 * * *',
      'select chageun_internal.cleanup_admin_history();');
  END IF;
END;
$outer$;
