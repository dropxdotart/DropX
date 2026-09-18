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
  // it out explicitly. Hot take votes have no feed presence (see schema) —
  // only captions and dares post here.
  const [{ data: captions }, { data: dares }] = await Promise.all([
    supabase
      .from('caption_responses')
      .select('id, user_id, caption, rating, submitted_at, profiles(id, username, display_name, avatar_url, role, badges, share_to_everyone), drops(prompt, caption_details(image_url))')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .limit(50),
    supabase
      .from('dare_submissions')
      .select('id, user_id, video_url, submitted_at, profiles(id, username, display_name, avatar_url, role, badges, share_to_everyone), drops(prompt)')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .limit(50),
  ])

  type CaptionRow = NonNullable<typeof captions>[number]
  type DareRow = NonNullable<typeof dares>[number]

  const captionItems: FeedItem[] = (captions ?? []).map((r: CaptionRow) => ({
    id: r.id,
    kind: 'caption' as const,
    user_id: r.user_id,
    prompt: (r.drops as unknown as { prompt: string })?.prompt ?? '',
    caption: r.caption,
    imageUrl: (r.drops as unknown as { caption_details: { image_url: string } | null })?.caption_details?.image_url ?? null,
    videoUrl: null,
    rating: r.rating,
    submitted_at: r.submitted_at,
    profiles: r.profiles as unknown as FeedItem['profiles'],
    likeCount: 0,
    likedByMe: false,
    authorFollowedByMe: false,
  }))

  const dareItems: FeedItem[] = (dares ?? []).map((r: DareRow) => ({
    id: r.id,
    kind: 'dare' as const,
    user_id: r.user_id,
    prompt: (r.drops as unknown as { prompt: string })?.prompt ?? '',
    caption: null,
    imageUrl: null,
    videoUrl: r.video_url,
    rating: null,
    submitted_at: r.submitted_at,
    profiles: r.profiles as unknown as FeedItem['profiles'],
    likeCount: 0,
    likedByMe: false,
    authorFollowedByMe: false,
  }))

  const allItems = [...captionItems, ...dareItems].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  )

  if (allItems.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 gap-3 text-center">
        <Rss className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground max-w-xs">
          Nothing here yet — answer today&apos;s drop to start seeing how everyone else did.
        </p>
      </div>
    )
  }

  const authorIds = [...new Set(allItems.map((i) => i.user_id))]
  const captionIds = captionItems.map((i) => i.id)
  const dareIds = dareItems.map((i) => i.id)

  const [{ data: captionLikes }, { data: dareLikes }, { data: myFollows }] = await Promise.all([
    captionIds.length
      ? supabase.from('likes').select('user_id, target_id').eq('target_type', 'caption_response').in('target_id', captionIds)
      : Promise.resolve({ data: [] as { user_id: string; target_id: string }[] }),
    dareIds.length
      ? supabase.from('likes').select('user_id, target_id').eq('target_type', 'dare_submission').in('target_id', dareIds)
      : Promise.resolve({ data: [] as { user_id: string; target_id: string }[] }),
    supabase.from('follows').select('followed_id').eq('follower_id', user.id).in('followed_id', authorIds),
  ])

  const allLikes = [...(captionLikes ?? []), ...(dareLikes ?? [])]
  const followedSet = new Set((myFollows ?? []).map((f) => f.followed_id))

  const items: FeedItem[] = allItems.map((item) => {
    const itemLikes = allLikes.filter((l) => l.target_id === item.id)
    return {
      ...item,
      likeCount: itemLikes.length,
      likedByMe: itemLikes.some((l) => l.user_id === user.id),
      authorFollowedByMe: followedSet.has(item.user_id),
    }
  })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <FeedTabs items={items} currentUserId={user.id} showEveryoneTab={myProfile?.show_everyone_tab ?? true} />
    </div>
  )
}
