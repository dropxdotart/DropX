import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FeedTabs from '@/components/feed/FeedTabs'
import { Rss } from 'lucide-react'
import type { FeedItem } from '@/lib/types'

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('show_everyone_tab')
    .eq('id', user.id)
    .single()

  // RLS still lets the owner see their own row after deletion (the home
  // page needs that to show "you deleted this"), so the feed has to filter
  // it out explicitly — otherwise a deleted answer would vanish for
  // everyone except the one person who retracted it.
  const { data: responses } = await supabase
    .from('responses')
    .select('id, user_id, answer, is_correct, photo_url, answered_at, profiles(id, username, display_name, role, badges, share_to_everyone), challenges(prompt, type)')
    .is('deleted_at', null)
    .order('answered_at', { ascending: false })
    .limit(50)

  if (!responses || responses.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 gap-3 text-center">
        <Rss className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground max-w-xs">
          Nothing here yet — answer today&apos;s challenge to start seeing how everyone else did.
        </p>
      </div>
    )
  }

  const responseIds = responses.map((r) => r.id)
  const authorIds = [...new Set(responses.map((r) => r.user_id))]

  const [{ data: likes }, { data: comments }, { data: myFollows }] = await Promise.all([
    supabase.from('likes').select('user_id, response_id').in('response_id', responseIds),
    supabase
      .from('comments')
      .select('id, user_id, response_id, body, created_at, profiles(id, username, display_name, role, badges)')
      .in('response_id', responseIds)
      .order('created_at', { ascending: true }),
    supabase.from('follows').select('followed_id').eq('follower_id', user.id).in('followed_id', authorIds),
  ])

  const followedSet = new Set((myFollows ?? []).map((f) => f.followed_id))

  const items: FeedItem[] = responses.map((r) => {
    const responseLikes = (likes ?? []).filter((l) => l.response_id === r.id)
    const responseComments = (comments ?? []).filter((c) => c.response_id === r.id)
    return {
      id: r.id,
      user_id: r.user_id,
      answer: r.answer,
      is_correct: r.is_correct,
      photo_url: r.photo_url,
      answered_at: r.answered_at,
      profiles: r.profiles as unknown as FeedItem['profiles'],
      challenges: r.challenges as unknown as FeedItem['challenges'],
      likeCount: responseLikes.length,
      likedByMe: responseLikes.some((l) => l.user_id === user.id),
      comments: responseComments as unknown as FeedItem['comments'],
      authorFollowedByMe: followedSet.has(r.user_id),
    }
  })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <FeedTabs items={items} currentUserId={user.id} showEveryoneTab={myProfile?.show_everyone_tab ?? true} />
    </div>
  )
}
