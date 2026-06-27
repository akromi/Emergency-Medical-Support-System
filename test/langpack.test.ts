import { describe, expect, it } from 'vitest'
import {
  registerLanguage, isRtl, nextLang, availableLanguages, templatePack, DICTS,
} from '../src/i18n'

describe('runtime language packs', () => {
  it('registers a pack with its own RTL flag and adds it to the cycle', () => {
    registerLanguage({ code: 'sw', name: 'Kiswahili', rtl: false, strings: { 'app.sub': 'Rekodi ya Majeruhi' } })
    expect(availableLanguages().some((l) => l.code === 'sw')).toBe(true)
    expect(isRtl('sw')).toBe(false)
    // The toggle cycle now includes the pack (after the four built-ins).
    expect(nextLang('fa')).toBe('sw')
    expect(nextLang('sw')).toBe('en')
  })

  it('honours a pack’s RTL declaration', () => {
    registerLanguage({ code: 'ur', name: 'اردو', rtl: true, strings: {} })
    expect(isRtl('ur')).toBe(true)
  })

  it('rejects an invalid pack', () => {
    // @ts-expect-error — deliberately malformed
    expect(() => registerLanguage({ name: 'x', strings: {} })).toThrow()
    // @ts-expect-error — deliberately malformed
    expect(() => registerLanguage({ code: 'zz' })).toThrow()
  })

  it('does not disturb the four built-ins', () => {
    registerLanguage({ code: 'eo', name: 'Esperanto', strings: { 'app.sub': 'x' } })
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('en')).toBe(false)
    expect(Object.keys(DICTS)).toEqual(['en', 'fr', 'ar', 'fa'])
  })

  it('templatePack ships the full English key set for translators', () => {
    const tpl = templatePack()
    expect(Object.keys(tpl.strings).sort()).toEqual(Object.keys(DICTS.en).sort())
    expect(tpl.strings['app.sub']).toBe(DICTS.en['app.sub'])
  })
})
