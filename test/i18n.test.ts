import { describe, expect, it } from 'vitest'
import { DICTS, LANGS, nextLang, isRtl, regionLabel } from '../src/i18n'
import { SPEECH_LANG } from '../src/components/Tutorial'

const EN_KEYS = Object.keys(DICTS.en).sort()

describe('i18n dictionaries', () => {
  it('defines all four languages in cycle order', () => {
    expect(LANGS).toEqual(['en', 'fr', 'ar', 'fa'])
  })

  // Every language must define exactly the English key set — no missing
  // translations (which would leak English) and no stray extra keys.
  for (const lang of LANGS) {
    it(`'${lang}' has the same keys as English (no gaps, no extras)`, () => {
      expect(Object.keys(DICTS[lang]).sort()).toEqual(EN_KEYS)
    })
  }

  it('no value is left identical to English in fr/ar/fa (spot-check core labels)', () => {
    // A few high-visibility keys that must actually be translated.
    for (const key of ['app.sub', 'hdr.new', 'vit.title', 'board.title', 'saved.title']) {
      expect(DICTS.fr[key]).not.toBe(DICTS.en[key])
      expect(DICTS.ar[key]).not.toBe(DICTS.en[key])
      expect(DICTS.fa[key]).not.toBe(DICTS.en[key])
    }
  })

  it('cycles languages en → fr → ar → fa → en', () => {
    expect(nextLang('en')).toBe('fr')
    expect(nextLang('fr')).toBe('ar')
    expect(nextLang('ar')).toBe('fa')
    expect(nextLang('fa')).toBe('en')
  })

  it('maps every language to a SpeechSynthesis BCP-47 tag (tour voice-over)', () => {
    // A missing tag silently falls back to en-US and mispronounces the narration.
    for (const lang of LANGS) {
      expect(SPEECH_LANG[lang], `speech tag for '${lang}'`).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(SPEECH_LANG[lang].slice(0, 2)).toBe(lang)
    }
  })

  it('marks Arabic and Persian as right-to-left, others left-to-right', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('fa')).toBe(true)
    expect(isRtl('en')).toBe(false)
    expect(isRtl('fr')).toBe(false)
  })

  it('localises region names with the anatomical side (incl. Arabic & Persian)', () => {
    expect(regionLabel('L Forearm', 'en')).toBe('L Forearm')
    expect(regionLabel('L Forearm', 'fr')).toBe('G Avant-bras')
    expect(regionLabel('L Forearm', 'ar')).toBe('يس الساعد')
    expect(regionLabel('L Forearm', 'fa')).toBe('چپ ساعد')
    expect(regionLabel('Chest', 'fa')).toBe('قفسه سینه')
  })
})
