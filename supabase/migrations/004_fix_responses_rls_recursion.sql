-- The "visible after you've answered" policy subqueried responses from
-- within its own policy, which re-triggers the same policy on the subquery
-- and recurses infinitely. A security-definer function breaks the cycle
-- (it runs with elevated privileges internally, bypassing RLS on the table
-- it touches, while still scoping correctly via auth.uid()).
drop policy "Responses visible after you've answered that challenge" on responses;

create function has_answered(target_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from responses
    where challenge_id = target_challenge_id
    and user_id = auth.uid()
  );
$$;

create policy "Responses visible after you've answered that challenge" on responses
  for select to authenticated using (has_answered(challenge_id));
