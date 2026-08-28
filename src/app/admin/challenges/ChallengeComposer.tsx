'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Loader2, Plus, X, ImagePlus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import AnswerForm from '@/components/challenge/AnswerForm'
import { createChallenge, updateChallenge, uploadChallengeImage, type ChallengeInput } from './actions'
import type { Challenge, ChallengeType } from '@/lib/types'

type ChoiceRow = { key: string; text: string; imageUrl: string | null }

const newChoice = (): ChoiceRow => ({ key: crypto.randomUUID(), text: '', imageUrl: null })

// Editing an existing draft passes `existing` — everything else about the
// form is identical, it just calls updateChallenge instead of
// createChallenge and seeds state from the current row.
type Existing = {
  id: string
  type: ChallengeType
  prompt: string
  prompt_image_url: string | null
  choices: string[] | null
  choices_are_images: boolean
  correct_answer: string
  graded: boolean
  explanation: string | null
  tags: string[]
  text_scale: number
  image_scale: number
}

function ImageSlot({
  label,
  value,
  onChange,
  aspectClass = 'aspect-square',
}: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  aspectClass?: string
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      const { url } = await uploadChallengeImage(formData)
      onChange(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (value) {
    return (
      <div className={cn('relative rounded-lg overflow-hidden border border-border', aspectClass)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL */}
        <img src={value} alt={label} className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-1 right-1 size-6 rounded-full bg-destructive/90 text-white flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={uploading}
      onClick={() => fileRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors',
        aspectClass
      )}
    >
      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      <span className="text-[11px]">{label}</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
    </button>
  )
}

export default function ChallengeComposer({ existing }: { existing?: Existing }) {
  const router = useRouter()
  const [type, setType] = useState<ChallengeType>(existing?.type ?? 'multiple_choice')
  const [prompt, setPrompt] = useState(existing?.prompt ?? '')
  const [promptImageUrl, setPromptImageUrl] = useState<string | null>(existing?.prompt_image_url ?? null)
  const [choicesAreImages, setChoicesAreImages] = useState(existing?.choices_are_images ?? false)
  const [choices, setChoices] = useState<ChoiceRow[]>(() => {
    if (existing?.type === 'multiple_choice' && existing.choices) {
      return existing.choices.map((c) => ({
        key: crypto.randomUUID(),
        text: existing.choices_are_images ? '' : c,
        imageUrl: existing.choices_are_images ? c : null,
      }))
    }
    return [newChoice(), newChoice()]
  })
  const [correctKey, setCorrectKey] = useState<string | null>(() => {
    if (existing?.type === 'multiple_choice' && existing.choices) {
      const idx = existing.choices.indexOf(existing.correct_answer)
      return idx >= 0 ? choices[idx]?.key ?? null : null
    }
    return null
  })
  const [graded, setGraded] = useState(existing?.graded ?? true)
  const [correctAnswer, setCorrectAnswer] = useState(existing && existing.type === 'text' ? existing.correct_answer : '')
  const [explanation, setExplanation] = useState(existing?.explanation ?? '')
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '')
  const [textScale, setTextScale] = useState(existing?.text_scale ?? 1)
  const [imageScale, setImageScale] = useState(existing?.image_scale ?? 1)
  const [saving, setSaving] = useState<'draft' | 'confirmed' | null>(null)

  const setChoiceText = (key: string, text: string) => setChoices((cs) => cs.map((c) => (c.key === key ? { ...c, text } : c)))
  const setChoiceImage = (key: string, imageUrl: string | null) => setChoices((cs) => cs.map((c) => (c.key === key ? { ...c, imageUrl } : c)))
  const addChoice = () => setChoices((cs) => (cs.length >= 6 ? cs : [...cs, newChoice()]))
  const removeChoice = (key: string) => {
    setChoices((cs) => cs.filter((c) => c.key !== key))
    if (correctKey === key) setCorrectKey(null)
  }

  const previewChallenge: Challenge = useMemo(() => {
    const choiceValues =
      type === 'multiple_choice'
        ? (choicesAreImages ? choices.map((c) => c.imageUrl) : choices.map((c) => c.text)).filter(Boolean) as string[]
        : null
    return {
      id: 'preview',
      drop_at: new Date().toISOString(),
      type,
      prompt: prompt || 'Your prompt will appear here',
      prompt_image_url: promptImageUrl,
      choices: choiceValues,
      choices_are_images: choicesAreImages,
      text_scale: textScale,
      image_scale: imageScale,
      created_at: new Date().toISOString(),
    }
  }, [type, prompt, promptImageUrl, choicesAreImages, choices, textScale, imageScale])

  const save = async (status: 'draft' | 'confirmed') => {
    if (saving) return

    const correctValue =
      type === 'multiple_choice'
        ? (choicesAreImages ? choices.find((c) => c.key === correctKey)?.imageUrl : choices.find((c) => c.key === correctKey)?.text) ?? ''
        : correctAnswer

    const input: ChallengeInput = {
      type,
      prompt,
      prompt_image_url: promptImageUrl,
      choices: type === 'multiple_choice' ? (choicesAreImages ? choices.map((c) => c.imageUrl ?? '') : choices.map((c) => c.text)) : null,
      choices_are_images: choicesAreImages,
      correct_answer: correctValue,
      graded: type === 'text' ? graded : true,
      explanation: explanation || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      scheduled_date: null,
      text_scale: textScale,
      image_scale: imageScale,
    }

    setSaving(status)
    try {
      if (existing) {
        await updateChallenge(existing.id, input, status)
      } else {
        await createChallenge(input, status)
      }
      toast.success(status === 'confirmed' ? 'Confirmed — ready to schedule' : 'Saved as draft')
      router.push('/admin/challenges?tab=new')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value as ChallengeType)} className="mt-1">
                <option value="multiple_choice">Multiple choice</option>
                <option value="text">Text</option>
                <option value="photo">Photo entry</option>
              </Select>
            </div>
            {type === 'text' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Grading</label>
                <Select value={graded ? 'graded' : 'ungraded'} onChange={(e) => setGraded(e.target.value === 'graded')} className="mt-1">
                  <option value="graded">Has a correct answer</option>
                  <option value="ungraded">No correct answer — mods rate it (e.g. captions)</option>
                </Select>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="mt-1" placeholder="What users see as the question" />
          </div>

          {type !== 'photo' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Prompt image (optional)</label>
              <div className="mt-1 w-28">
                <ImageSlot label="Add image" value={promptImageUrl} onChange={setPromptImageUrl} />
              </div>
            </div>
          )}

          {type === 'multiple_choice' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Choices — pick the correct one</label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={choicesAreImages} onChange={(e) => setChoicesAreImages(e.target.checked)} />
                  Image choices
                </label>
              </div>
              <div className="space-y-2">
                {choices.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Mark correct"
                      onClick={() => setCorrectKey(c.key)}
                      className={cn(
                        'shrink-0 size-6 rounded-full border flex items-center justify-center transition-colors',
                        correctKey === c.key ? 'bg-[color:var(--positive)] border-[color:var(--positive)] text-white' : 'border-border text-transparent'
                      )}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    {choicesAreImages ? (
                      <div className="w-16"><ImageSlot label="Image" value={c.imageUrl} onChange={(url) => setChoiceImage(c.key, url)} /></div>
                    ) : (
                      <Input value={c.text} onChange={(e) => setChoiceText(c.key, e.target.value)} placeholder="Choice text" className="flex-1" />
                    )}
                    <button type="button" onClick={() => removeChoice(c.key)} disabled={choices.length <= 2} className="text-muted-foreground hover:text-destructive disabled:opacity-30">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addChoice} disabled={choices.length >= 6}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add choice
              </Button>
            </div>
          )}

          {type === 'text' && graded && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Correct answer</label>
              <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className="mt-1" placeholder="Matched case-insensitively" />
              <p className="text-[11px] text-muted-foreground mt-1">Answers that don&apos;t match exactly go to mods for review instead of failing outright.</p>
            </div>
          )}

          {type === 'text' && !graded && (
            <p className="text-[11px] text-muted-foreground">Every response goes to the Caption review queue, where mods rate it 1–10 instead of marking it right or wrong.</p>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Explanation (optional)</label>
            <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className="mt-1" placeholder="Shown after answering" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1" placeholder="pop-culture, easy" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">Display size</p>
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Text size</span><span className="tabular-nums">{Math.round(textScale * 100)}%</span>
            </div>
            <input type="range" min={0.75} max={1.5} step={0.05} value={textScale} onChange={(e) => setTextScale(Number(e.target.value))} className="w-full" />
          </div>
          {promptImageUrl && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Image size</span><span className="tabular-nums">{Math.round(imageScale * 100)}%</span>
              </div>
              <input type="range" min={0.6} max={1.4} step={0.05} value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} className="w-full" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={Boolean(saving)} onClick={() => save('draft')}>
            {saving === 'draft' && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Save as draft
          </Button>
          <Button disabled={Boolean(saving)} onClick={() => save('confirmed')}>
            {saving === 'confirmed' && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Save & confirm
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Only confirmed challenges can be scheduled or pushed.</p>
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Live preview</p>
        <div className="dark mx-auto w-[300px] rounded-[2.25rem] border-[6px] border-neutral-800 bg-background overflow-hidden shadow-xl">
          <div className="h-[560px] overflow-y-auto flex flex-col items-center justify-center p-5">
            <AnswerForm challenge={previewChallenge} preview />
          </div>
        </div>
      </div>
    </div>
  )
}
