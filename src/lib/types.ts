export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export type PublicProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>

export type RoomStatus = 'lobby' | 'in_round' | 'finished'
export type RoundType = 'hot_take' | 'who_said_it' | 'caption'
export type RoundStatus = 'pending' | 'answering' | 'guessing' | 'revealed'

export type Room = {
  id: string
  code: string
  host_id: string
  status: RoomStatus
  current_round_index: number
  created_at: string
}

export type RoomPlayer = {
  room_id: string
  user_id: string
  score: number
  joined_at: string
  profiles: PublicProfile
}

export type Round = {
  id: string
  room_id: string
  round_index: number
  type: RoundType
  prompt: string
  option_a: string | null
  option_b: string | null
  image_url: string | null
  status: RoundStatus
  started_at: string | null
}

export type HotTakeVote = {
  round_id: string
  user_id: string
  choice: 'a' | 'b'
  voted_at: string
}

export type WhoSaidItAnswer = {
  round_id: string
  user_id: string
  answer: string
  submitted_at: string
}

export type WhoSaidItGuess = {
  round_id: string
  guesser_id: string
  answer_author_id: string
  guessed_author_id: string
}

export type CaptionSubmission = {
  round_id: string
  user_id: string
  caption: string
  submitted_at: string
}

export type CaptionVote = {
  round_id: string
  voter_id: string
  caption_author_id: string
  voted_at: string
}
