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

export type Profile = {
  id: string
  username: string | null
  current_streak: number
  longest_streak: number
  last_answered_date: string | null
  role: UserRole
  badges: string[]
  strike_count: number
  show_everyone_tab: boolean
}

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'role' | 'badges'>

export type Comment = {
  id: string
  user_id: string
  response_id: string
  body: string
  created_at: string
  profiles: PublicProfile
}

export type ModQueueItem = {
  id: string
  photo_url: string
  answered_at: string
  profiles: Pick<PublicProfile, 'username'>
  challenges: Pick<Challenge, 'prompt'>
}

export type FeedItem = {
  id: string
  user_id: string
  answer: string
  is_correct: boolean | null
  photo_url: string | null
  answered_at: string
  profiles: PublicProfile
  challenges: Pick<Challenge, 'prompt' | 'type'>
  likeCount: number
  likedByMe: boolean
  comments: Comment[]
  authorFollowedByMe: boolean
}
