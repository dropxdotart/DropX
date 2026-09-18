export type DropType = 'hot_take' | 'caption' | 'dare'
export type DropStatus = 'draft' | 'confirmed'

export type Drop = {
  id: string
  type: DropType
  prompt: string
  drop_at: string
  created_at: string
}

export type DropAdmin = {
  id: string
  type: DropType
  prompt: string
  drop_at: string | null
  scheduled_date: string | null
  status: DropStatus
  created_at: string
}

export type HotTakeDetails = {
  drop_id: string
  option_a: string
  option_b: string
}

export type CaptionDetails = {
  drop_id: string
  image_url: string
}

export type DareDetails = {
  drop_id: string
  exercise_label: string | null
  target_reps: number | null
}

export type ModerationStatus = 'pending' | 'approved' | 'rejected'

export type UserRole = 'user' | 'mod' | 'admin'
export type AccountStatus = 'active' | 'suspended' | 'banned'

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  display_name_changed_at: string | null
  avatar_url: string | null
  current_streak: number
  longest_streak: number
  last_answered_date: string | null
  role: UserRole
  badges: string[]
  strike_count: number
  show_everyone_tab: boolean
  share_to_everyone: boolean
  account_status: AccountStatus
  created_at: string
  is_bot: boolean
}

export type Strike = {
  id: string
  user_id: string
  issued_by: string
  reason: string | null
  target_type: string | null
  target_id: string | null
  created_at: string
  issuer: Pick<PublicProfile, 'username' | 'display_name'>
  revoked_at: string | null
  revoked_by: string | null
  revoker: Pick<PublicProfile, 'username' | 'display_name'> | null
}

export type AdminAction = {
  id: string
  target_user_id: string
  actor_id: string
  action: string
  detail: string | null
  created_at: string
  actor: Pick<PublicProfile, 'username' | 'display_name'> | null
}

export type ModerationLogEntry = {
  id: string
  target_type: 'caption_response' | 'dare_submission'
  target_id: string
  moderator_id: string
  decision: ModerationStatus
  created_at: string
  moderator: Pick<PublicProfile, 'username' | 'display_name'>
}

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'role' | 'badges'>

export type CaptionQueueItem = {
  id: string
  caption: string
  submitted_at: string
  profiles: Pick<PublicProfile, 'username' | 'display_name'>
  drops: Pick<Drop, 'prompt'> & { caption_details: Pick<CaptionDetails, 'image_url'> | null }
}

export type DareQueueItem = {
  id: string
  video_url: string
  counted_reps: number | null
  submitted_at: string
  profiles: Pick<PublicProfile, 'username' | 'display_name'>
  drops: Pick<Drop, 'prompt'>
}

export type FeedItem = {
  id: string
  kind: 'caption' | 'dare'
  user_id: string
  prompt: string
  caption: string | null
  imageUrl: string | null
  videoUrl: string | null
  rating: number | null
  submitted_at: string
  profiles: PublicProfile & Pick<Profile, 'share_to_everyone'>
  likeCount: number
  likedByMe: boolean
  authorFollowedByMe: boolean
}

export type AvatarPreset = {
  id: string
  image_url: string
  label: string | null
  active: boolean
  created_at: string
}

export type ReportStatus = 'pending' | 'resolved' | 'dismissed'

export type Report = {
  id: string
  reporter_id: string
  target_user_id: string
  target_type: string
  target_ref: string | null
  reason: string | null
  status: ReportStatus
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}
