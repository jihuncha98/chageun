BEGIN;
CREATE OR REPLACE FUNCTION public.chageun_chat_page(p_group uuid,p_before bigint DEFAULT NULL)
RETURNS TABLE(message_id text,nickname text,body text,sent_at timestamptz,is_mine boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group)
 OR NOT (public.chageun_is_admin() OR EXISTS(SELECT 1 FROM public.study_group_members
 WHERE group_id=p_group AND user_id=auth.uid() AND status='accepted'))
 THEN RAISE EXCEPTION '채팅을 열람할 권한이 없어요.'; END IF;
 RETURN QUERY SELECT m.id::text,f.nickname,m.body,m.created_at,m.sender=auth.uid() FROM chageun_internal.group_messages m
 JOIN public.friend_profiles f ON f.user_id=m.sender WHERE m.group_id=p_group
 AND m.created_at>now()-interval '7 days' AND (p_before IS NULL OR m.id<p_before)
 ORDER BY m.id DESC LIMIT 50;
END;
$$;
CREATE OR REPLACE FUNCTION public.chageun_chat_delete(p_group uuid,p_message bigint,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE author uuid; actor uuid:=auth.uid();
BEGIN
 SELECT sender INTO author FROM chageun_internal.group_messages
 WHERE group_id=p_group AND id=p_message AND created_at>now()-interval '7 days'
 AND EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '삭제할 수 없는 메시지예요.'; END IF;
 IF public.chageun_is_admin() AND author<>actor THEN
   IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION '삭제 사유를 2~150자로 입력해 주세요.'; END IF;
   PERFORM chageun_internal.admin_log(actor,'chat_deleted',p_reason,author,p_group);
   PERFORM chageun_internal.notify_user(author,'그룹 메시지 삭제','전체 관리자가 메시지를 삭제했어요. 사유: '||p_reason);
 ELSIF author IS DISTINCT FROM actor OR NOT (public.chageun_is_admin() OR EXISTS(
   SELECT 1 FROM public.study_group_members WHERE group_id=p_group AND user_id=actor AND status='accepted'))
 THEN RAISE EXCEPTION '메시지를 삭제할 권한이 없어요.'; END IF;
 DELETE FROM chageun_internal.group_messages WHERE group_id=p_group AND id=p_message;
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_chat_page(uuid,bigint),public.chageun_chat_delete(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_chat_page(uuid,bigint),public.chageun_chat_delete(uuid,bigint,text) TO authenticated;
COMMIT;
