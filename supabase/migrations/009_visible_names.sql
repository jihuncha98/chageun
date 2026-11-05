-- 차근 표시 이름/친구 별명 분리 표시. 기존 기록/그룹/채팅 메시지는 변경하거나 삭제하지 않음.
-- 기존 001~008 및 운영 중인 상태 판정/통계 수정 함수를 덮어쓰지 않습니다.
BEGIN;

-- Server-only formatting helper; users cannot call it as an unauthenticated API.
CREATE OR REPLACE FUNCTION chageun_internal.name_label(p_display text,p_nick text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN nullif(btrim(coalesce(p_display,'')),'') IS NULL
   THEN coalesce(nullif(btrim(coalesce(p_nick,'')),''),'차근 사용자')
 WHEN btrim(p_display)=btrim(coalesce(p_nick,'')) THEN btrim(p_display)
 ELSE btrim(p_display)||' (별명: '||btrim(coalesce(p_nick,''))||')' END;
$$;
REVOKE ALL ON FUNCTION chageun_internal.name_label(text,text) FROM PUBLIC,anon,authenticated;

-- Only return public-facing names for the signed-in user's own friends,
-- accepted group peers, or an inviting group owner. Never expose e-mail/metadata.
CREATE OR REPLACE FUNCTION public.chageun_visible_names(p_users uuid[])
RETURNS TABLE(user_id uuid,display_name text,nickname text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid();
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
 IF p_users IS NULL OR cardinality(p_users)>100 THEN
   RAISE EXCEPTION '조회할 이름은 한 번에 최대 100명입니다.';
 END IF;
 RETURN QUERY
 SELECT p.user_id,
   nullif(btrim(u.raw_user_meta_data->>'chageun_display_name'),''),p.nickname
 FROM public.friend_profiles p
 JOIN auth.users u ON u.id=p.user_id
 WHERE p.user_id=ANY(p_users) AND (
  p.user_id=me
  OR EXISTS(SELECT 1 FROM public.friend_links fl WHERE
    (fl.user_a=me AND fl.user_b=p.user_id) OR (fl.user_b=me AND fl.user_a=p.user_id))
  OR EXISTS(SELECT 1 FROM public.study_group_members mine
    JOIN public.study_group_members peer ON peer.group_id=mine.group_id
    WHERE mine.user_id=me AND mine.status='accepted'
      AND peer.user_id=p.user_id AND peer.status='accepted')
  OR EXISTS(SELECT 1 FROM public.study_group_members invite
    JOIN public.study_groups g ON g.id=invite.group_id
    WHERE invite.user_id=me AND invite.status='pending' AND g.owner_id=p.user_id)
 );
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_visible_names(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_visible_names(uuid[]) TO authenticated;

-- Invitees may see the group owner's public-facing name, not private account metadata.
CREATE OR REPLACE FUNCTION public.chageun_invitation_owner_labels()
RETURNS TABLE(group_id uuid,owner_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
 RETURN QUERY
 SELECT mine.group_id,
  chageun_internal.name_label(u.raw_user_meta_data->>'chageun_display_name',fp.nickname)
 FROM public.study_group_members mine
 JOIN public.study_groups g ON g.id=mine.group_id
 JOIN public.friend_profiles fp ON fp.user_id=g.owner_id
 JOIN auth.users u ON u.id=fp.user_id
 WHERE mine.user_id=auth.uid() AND mine.status='pending';
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_invitation_owner_labels() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_invitation_owner_labels() TO authenticated;

-- Preserve the existing message API signature and seven-day expiry policy.
CREATE OR REPLACE FUNCTION public.chageun_chat_page(p_group uuid,p_before bigint DEFAULT NULL)
RETURNS TABLE(message_id text,nickname text,body text,sent_at timestamptz,is_mine boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group)
 OR NOT (public.chageun_is_admin() OR EXISTS(SELECT 1 FROM public.study_group_members
 WHERE group_id=p_group AND user_id=auth.uid() AND status='accepted'))
 THEN RAISE EXCEPTION '채팅을 열람할 권한이 없어요.'; END IF;
 RETURN QUERY SELECT m.id::text,chageun_internal.name_label(u.raw_user_meta_data->>'chageun_display_name',f.nickname),m.body,m.created_at,m.sender=auth.uid() FROM chageun_internal.group_messages m
 JOIN public.friend_profiles f ON f.user_id=m.sender
 JOIN auth.users u ON u.id=m.sender WHERE m.group_id=p_group
 AND m.created_at>now()-interval '7 days' AND (p_before IS NULL OR m.id<p_before)
 ORDER BY m.id DESC LIMIT 50;
END;
$$;
CREATE OR REPLACE FUNCTION public.chageun_chat_read(p_group uuid,p_before bigint DEFAULT NULL)
RETURNS TABLE(message_id text,nickname text,body text,sent_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group)
 OR NOT (public.chageun_is_admin() OR EXISTS(SELECT 1 FROM public.study_group_members
 WHERE group_id=p_group AND user_id=auth.uid() AND status='accepted'))
 THEN RAISE EXCEPTION '채팅을 열람할 권한이 없어요.'; END IF;
 RETURN QUERY SELECT m.id::text,chageun_internal.name_label(u.raw_user_meta_data->>'chageun_display_name',f.nickname),m.body,m.created_at FROM chageun_internal.group_messages m
 JOIN public.friend_profiles f ON f.user_id=m.sender
 JOIN auth.users u ON u.id=m.sender WHERE m.group_id=p_group
 AND m.created_at>now()-interval '7 days' AND (p_before IS NULL OR m.id<p_before)
 ORDER BY m.id DESC LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_chat_page(uuid,bigint),public.chageun_chat_read(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_chat_page(uuid,bigint),public.chageun_chat_read(uuid,bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
