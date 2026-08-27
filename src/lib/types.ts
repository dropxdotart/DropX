export type ChallengeType = 'multiple_choice' | 'text' | 'photo'

export type Challenge = {
  id: string
  drop_at: string
  type: ChallengeType
  prompt: string
  choices: string[] | null
  created_at: string
}

export type ChallengeWithAnswer = Challenge & {
  correct_answer: string
  explanation: string | null
}

export type ChallengeAdmin = ChallengeWithAnswer & {
  drop_at: string | null
  scheduled_date: string | null
  tags: string[]
}

export type ChallengeIdea = {
  id: string
  submitted_by: string
  type: ChallengeType
  idea: string
  created_at: string
}

export type ModerationStatus = 'pending' | 'approved' | 'rejected'

export type Response = {
  id: string
  user_id: string
  challenge_id: string
  answer: string
  is_correct: boolean | null
  photo_url: string | null
  moderation_status: ModerationStatus
  answered_at: string
}

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
  response_id: string | null
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
  response_id: string
  moderator_id: string
  decision: ModerationStatus
  created_at: string
  moderator: Pick<PublicProfile, 'username' | 'display_name'>
  response: {
    user_id: string
    photo_url: string | null
    profiles: Pick<PublicProfile, 'username' | 'display_name'>
  }
}

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'role' | 'badges'>

export type ModQueueItem = {
  id: string
  photo_url: string
  answered_at: string
  profiles: Pick<PublicProfile, 'username' | 'display_name'>
  challenges: Pick<Challenge, 'prompt'>
}

export type FeedItem = {
  id: string
  user_id: string
  answer: string
  is_correct: boolean | null
  photo_url: string | null
  answered_at: string
  profiles: PublicProfile & Pick<Profile, 'share_to_everyone'>
  challenges: Pick<Challenge, 'prompt' | 'type'>
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
