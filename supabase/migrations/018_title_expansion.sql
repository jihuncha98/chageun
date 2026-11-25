begin;

insert into chageun_internal.shop_catalog (id, kind, label, level, price, active)
values
 ('title8', 'title', '차근 거장', 8, 2500, true),
 ('title9', 'title', '차근 전설', 9, 4000, true),
 ('title10', 'title', '차지훈', 10, 6000, true)
on conflict (id) do nothing;

-- Keep the earlier RPC available to clients cached by the PWA.
create or replace function public.chageun_social_title_labels(p_users uuid[])
returns table(user_id uuid, display_name text, title text, title_level integer)
language sql stable security definer set search_path = '' as $$
 select v.user_id, v.display_name, coalesce(c.label, '차근 사용자'), coalesce(c.level, 1)
 from public.chageun_visible_names(p_users) v
 left join chageun_internal.shop_worn w on w.account = v.user_id and w.kind = 'title'
 left join chageun_internal.shop_catalog c on c.id = w.item and c.kind = 'title'
$$;

revoke all on function public.chageun_social_title_labels(uuid[]) from public, anon;
grant execute on function public.chageun_social_title_labels(uuid[]) to authenticated;
notify pgrst, 'reload schema';

commit;
