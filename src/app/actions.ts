'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creditStreakForDrop } from '@/lib/streak'
import { logAdminAction } from '@/lib/audit'

// Hot takes have no right/wrong and no moderation — an instant vote, streak
// credited immediately (same "answering is what counts" rule as everything
// else that doesn't need a mod pass).
export async function submitHotTakeVote(dropId: string, choice: 'a' | 'b'): Promise<{ currentStreak: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to vote')

  const { data: drop, error: dropError } = await supabase.from('drops').select('drop_at').eq('id', dropId).single()
  if (dropError || !drop) throw new Error('Drop not found')

  const { error: insertError } = await supabase
    .from('hot_take_votes')
    .insert({ drop_id: dropId, user_id: user.id, choice })

  let currentStreak: number
  if (insertError) {
    if (insertError.code !== '23505') throw new Error(insertError.message)
    const { data: profile } = await supabase.from('profiles').select('current_streak').eq('id', user.id).single()
    currentStreak = profile?.current_streak ?? 0
  } else {
    ;({ currentStreak } = await creditStreakForDrop(supabase, user.id, drop.drop_at))
  }

  revalidatePath('/')
  revalidatePath('/profile')
  return { currentStreak }
}

// Aggregate counts are never sensitive (nothing here identifies who voted
// which way), so this is a plain read — the "don't show the split until
// you've voted" rule is enforced by the client only calling this after a
// vote is cast, not by hiding the data itself.
export async function getHotTakeCounts(dropId: string): Promise<{ a: number; b: number }> {
  const supabase = await createClient()
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from('hot_take_votes').select('id', { count: 'exact', head: true }).eq('drop_id', dropId).eq('choice', 'a'),
    supabase.from('hot_take_votes').select('id', { count: 'exact', head: true }).eq('drop_id', dropId).eq('choice', 'b'),
  ])
  return { a: a ?? 0, b: b ?? 0 }
}

// Captions can't be auto-graded — every response inserts as 'pending' and
// goes to the Caption review queue, where a mod either rates it 1-10
// (credits the streak) or removes it (doesn't) — see mod/actions.ts's
// rateCaption/removeCaption. "Remove" is meant to genuinely exclude spam/
// abuse from counting, which is why this waits instead of crediting on
// submission the way a hot take vote does.
export async function submitCaption(dropId: string, caption: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to answer')
  if (!caption.trim()) throw new Error('Caption cannot be empty')

  const { error: insertError } = await supabase
    .from('caption_responses')
    .insert({ drop_id: dropId, user_id: user.id, caption: caption.trim() })

  if (insertError && insertError.code !== '23505') throw new Error(insertError.message)
  revalidatePath('/')
}

// Same moderated-before-it-counts shape as captions — a rejected dare video
// (faked, wrong exercise, inappropriate) shouldn't count toward the streak.
export async function submitDare(dropId: string, videoUrl: string, countedReps: number | null): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to answer')

  const { error: insertError } = await supabase
    .from('dare_submissions')
    .insert({ drop_id: dropId, user_id: user.id, video_url: videoUrl, counted_reps: countedReps })

  if (insertError && insertError.code !== '23505') throw new Error(insertError.message)
  revalidatePath('/')
}

// Retracts a user's own caption/dare — the row stays (unique(drop_id,
// user_id) still blocks resubmitting to that drop), just hidden from
// everyone but the owner and logged for admins. There's no RLS UPDATE
// policy letting a user touch their own submission (deliberately — answers
// are meant to be final), so this authorizes on the real session and
// writes through the admin client, same pattern as every other privileged
// mutation in this app.
export async function deleteMyResponse(targetType: 'caption_response' | 'dare_submission', id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const table = targetType === 'caption_response' ? 'caption_responses' : 'dare_submissions'
  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!updated) throw new Error('Nothing to delete')

  await logAdminAction(admin, { actorId: user.id, targetUserId: user.id, action: 'answer_deleted', detail: 'Deleted their own answer' })

  revalidatePath('/')
  revalidatePath('/feed')
  revalidatePath('/profile')
}
