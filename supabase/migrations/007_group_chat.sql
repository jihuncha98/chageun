BEGIN;
-- Group IDs survive the seven-day archive/restore cycle.
CREATE TABLE IF NOT EXISTS chageun_internal.group_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 group_id uuid NOT NULL,
 sender uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_messages_page ON chageun_internal.group_messages(group_id,id DESC);
CREATE INDEX IF NOT EXISTS group_messages_expiry ON chageun_internal.group_messages(created_at);
REVOKE ALL ON chageun_internal.group_messages FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.chageun_chat_read(p_group uuid,p_before bigint DEFAULT NULL)
RETURNS TABLE(message_id text,nickname text,body text,sent_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.study_groups WHERE id=p_group)
 OR NOT (public.chageun_is_admin() OR EXISTS(SELECT 1 FROM public.study_group_members
 WHERE group_id=p_group AND user_id=auth.uid() AND status='accepted'))
 THEN RAISE EXCEPTION '채팅을 열람할 권한이 없어요.'; END IF;
 RETURN QUERY SELECT m.id::text,f.nickname,m.body,m.created_at FROM chageun_internal.group_messages m
 JOIN public.friend_profiles f ON f.user_id=m.sender WHERE m.group_id=p_group
 AND m.created_at>now()-interval '7 days' AND (p_before IS NULL OR m.id<p_before)
 ORDER BY m.id DESC LIMIT 50;
END;
$$;
CREATE OR REPLACE FUNCTION public.chageun_chat_send(p_group uuid,p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE me uuid:=auth.uid();
BEGIN
 PERFORM 1 FROM public.study_group_members WHERE group_id=p_group AND user_id=me AND status='accepted' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION '가입을 수락한 그룹원만 보낼 수 있어요.'; END IF;
 IF EXISTS(SELECT 1 FROM public.chageun_chat_restrictions WHERE user_id=me AND ends_at>now())
 THEN RAISE EXCEPTION '채팅 제한 중에는 메시지를 보낼 수 없어요.'; END IF;
 IF p_body IS NULL OR p_body !~ '[^[:space:]]' OR char_length(p_body)>1000 THEN RAISE EXCEPTION '메시지는 1~1000자로 입력해 주세요.'; END IF;
 INSERT INTO chageun_internal.group_messages(group_id,sender,body) VALUES(p_group,me,btrim(p_body));
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_chat_read(uuid,bigint),public.chageun_chat_send(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chageun_chat_read(uuid,bigint),public.chageun_chat_send(uuid,text) TO authenticated;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
   RAISE EXCEPTION '7일 보관을 위해 Supabase Cron을 먼저 활성화해 주세요.';
 END IF;
 PERFORM cron.schedule('chageun-group-chat-expiry','*/10 * * * *',
   'delete from chageun_internal.group_messages where created_at <= now() - interval ''7 days''');
END;
$$;
COMMIT;
