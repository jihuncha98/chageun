BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE IF NOT EXISTS chageun_internal.push_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 public_key text,
 private_key text,
 worker_token text NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text)
);
INSERT INTO chageun_internal.push_config(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.chageun_push_devices (
 endpoint text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 subscription jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 tested_at timestamptz
);
ALTER TABLE public.chageun_push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chageun_push_devices FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.chageun_push_devices TO service_role;
CREATE TABLE IF NOT EXISTS public.chageun_push_queue (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 endpoint text NOT NULL REFERENCES public.chageun_push_devices(endpoint) ON DELETE CASCADE,
 broadcast_id uuid REFERENCES public.chageun_broadcasts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 available_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
 UNIQUE(endpoint,broadcast_id)
);
ALTER TABLE public.chageun_push_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chageun_push_queue FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.chageun_push_queue TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.chageun_push_queue_id_seq TO service_role;
REVOKE ALL ON chageun_internal.push_config FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.chageun_push_config(p_public text,p_private text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 UPDATE chageun_internal.push_config SET public_key=p_public,private_key=p_private
 WHERE singleton AND public_key IS NULL;
 SELECT jsonb_build_object('publicKey',public_key,'privateKey',private_key,'workerToken',worker_token)
 INTO result FROM chageun_internal.push_config WHERE singleton;
 RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.chageun_push_claim()
RETURNS SETOF public.chageun_push_queue LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.chageun_push_queue q SET state='sending',attempts=q.attempts+1,available_at=now()+interval '2 minutes'
 WHERE q.id IN (
 SELECT id FROM public.chageun_push_queue WHERE state IN ('pending','sending')
 AND available_at<=now() AND attempts<4 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10
 ) RETURNING q.*;
$$;
CREATE OR REPLACE FUNCTION chageun_internal.push_wake()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.chageun_push_queue WHERE state IN ('pending','sending') AND available_at<=now() AND attempts<4) THEN
  PERFORM net.http_post(
   url:='https://lnpdwopdvfvxunpizyfn.supabase.co/functions/v1/chageun-push',
   headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',
    (SELECT worker_token FROM chageun_internal.push_config WHERE singleton)),
   body:='{"action":"deliver"}'::jsonb,timeout_milliseconds:=5000
  );
 END IF;
END;
$$;
CREATE OR REPLACE FUNCTION chageun_internal.push_broadcast()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.active THEN
  INSERT INTO public.chageun_push_queue(endpoint,broadcast_id)
   SELECT d.endpoint,NEW.id FROM public.chageun_push_devices d JOIN auth.users u ON u.id=d.user_id
   WHERE (NEW.target_user_id IS NULL OR NEW.target_user_id=d.user_id)
   AND u.created_at<=NEW.published_at ON CONFLICT DO NOTHING;
  PERFORM chageun_internal.push_wake();
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chageun_push_broadcast ON public.chageun_broadcasts;
CREATE TRIGGER chageun_push_broadcast AFTER INSERT ON public.chageun_broadcasts
 FOR EACH ROW EXECUTE FUNCTION chageun_internal.push_broadcast();
CREATE OR REPLACE FUNCTION public.chageun_push_test(p_endpoint text,p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.chageun_push_devices SET tested_at=now() WHERE endpoint=p_endpoint AND user_id=p_user
 AND (tested_at IS NULL OR tested_at<now()-interval '1 minute');
 IF NOT FOUND THEN RAISE EXCEPTION '테스트 알림은 1분 후 다시 보내 주세요.'; END IF;
 INSERT INTO public.chageun_push_queue(endpoint) VALUES(p_endpoint);
 PERFORM chageun_internal.push_wake();
END;
$$;
REVOKE ALL ON FUNCTION public.chageun_push_config(text,text),public.chageun_push_claim(),public.chageun_push_test(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chageun_push_config(text,text),public.chageun_push_claim(),public.chageun_push_test(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION chageun_internal.push_wake(),chageun_internal.push_broadcast() FROM PUBLIC,anon,authenticated;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN RAISE EXCEPTION 'Supabase Cron을 활성화해 주세요.'; END IF;
 PERFORM cron.schedule('chageun-push-delivery','* * * * *',
  'select chageun_internal.push_wake(); delete from public.chageun_push_queue where created_at < now() - interval ''7 days'';');
END;
$$;
COMMIT;
