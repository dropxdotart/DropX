import type { AdminClient } from '@/lib/supabase/admin'

// A single append-only trail for every privileged action taken anywhere in
// the app — challenges, users, moderation, settings, bots — so /admin/audit
// can show one unified feed and a user's popup can filter it down to just
// what happened to their account, instead of piecing history together from
// half a dozen purpose-specific tables. Always insert with the admin client:
// there's no insert RLS policy, deliberately, since only server actions that
// have already checked the caller's role should ever be able to write here.
export async function logAdminAction(
  admin: AdminClient,
  params: { actorId: string; targetUserId?: string | null; action: string; detail?: string | null }
): Promise<void> {
  await admin.from('admin_actions').insert({
    actor_id: params.actorId,
    target_user_id: params.targetUserId ?? null,
    action: params.action,
    detail: params.detail ?? null,
  })
}

// Human-readable label for an admin_actions.action tag — falls back to the
// raw tag so a future action type never renders as blank.
export const ADMIN_ACTION_LABELS: Record<string, string> = {
  user_created: 'Account created',
  role_changed: 'Role changed',
  status_changed: 'Status changed',
  badges_updated: 'Badges updated',
  identity_overridden: 'Identity overridden',
  display_name_changed: 'Display name changed',
  strike_issued: 'Strike issued',
  strike_revoked: 'Strike revoked',
  streak_day_overridden: 'Streak day edited',
  streak_day_reset: 'Streak day reset',
  streak_extended: 'Streak extended',
  answer_deleted: 'Answer deleted',
  photo_approved: 'Photo approved',
  photo_rejected: 'Photo rejected',
  moderation_reversed: 'Moderation reversed',
  challenge_created: 'Challenge created',
  challenge_updated: 'Challenge updated',
  challenge_scheduled: 'Challenge scheduled',
  challenge_pushed: 'Challenge pushed live',
  challenge_deleted: 'Challenge deleted',
  settings_updated: 'Settings updated',
  bot_created: 'Bot created',
}
