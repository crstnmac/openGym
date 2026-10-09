// @vitest-environment happy-dom
// Body fat: the tape method starts from the measurements and writes them back as today's, the
// caliper and manual methods need only what they name, and nothing sane-less is saved.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bodyFatSheet } from './sheets.jsx'
import { todayISO } from './lib/format.js'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []
function mountTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const field = (host, label) => host.querySelector(`input[aria-label="${label}"]`)
function type(input, text) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  act(() => { set.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
function install(extra = {}) {
  const S = clone(DEF)
  Object.assign(S, { unit: 'kg', body: 'male', measures: [], bodyfat: [], age: null, height: null }, extra)
  useStore.setState({ S, user: null })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toasts: [] })
  document.body.innerHTML = ''
  install()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('tape (Navy)', () => {
  it('starts from the latest measurements and estimates once the height is in', () => {
    install({ measures: [{ d: '2026-09-01', t: 1, v: { neck: 38, waist: 88 } }] })
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    expect(field(host, 'Neck (cm)').value).toBe('38')
    expect(field(host, 'Waist (cm)').value).toBe('88')
    expect(host.textContent).toContain('Estimated body fat–')
    type(field(host, 'Height (cm)'), '180')
    expect(host.textContent).not.toContain('Estimated body fat–')
    expect(host.textContent).toMatch(/Estimated body fat\d+(\.\d)? %/)
  })

  it('saves the reading, keeps height, and logs the tape as today’s measurements', () => {
    install({ measures: [{ d: '2026-09-01', t: 1, v: { neck: 38, waist: 88 } }] })
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    type(field(host, 'Height (cm)'), '180')
    type(field(host, 'Waist (cm)'), '86')
    act(() => button(host, 'Save').click())
    const S = useStore.getState().S
    expect(S.bodyfat).toHaveLength(1)
    expect(S.bodyfat[0]).toMatchObject({ d: todayISO(), m: 'navy' })
    expect(S.height).toBe(180)
    const today = S.measures.find(m => m.d === todayISO())
    expect(today.v).toMatchObject({ neck: 38, waist: 86 })
    expect(today.v.hips).toBeUndefined()
  })

  it('a woman’s reading also asks for the hips', () => {
    install({ body: 'female' })
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    expect(field(host, 'Hips (cm)')).toBeTruthy()
  })

  it('in inches, converts what was typed', () => {
    install({ unit: 'lb', measures: [{ d: '2026-09-01', t: 1, v: { neck: 38.1, waist: 88.9 } }] })
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    expect(field(host, 'Neck (in)').value).toBe('15')
    expect(field(host, 'Waist (in)').value).toBe('35')
  })
})

describe('caliper and manual', () => {
  it('manual saves the typed percentage', () => {
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    act(() => button(host, 'Manual').click())
    type(field(host, 'Body fat (%)'), '17.5')
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.bodyfat[0]).toMatchObject({ pct: 17.5, m: 'manual' })
    expect(useStore.getState().S.measures).toEqual([])
  })

  it('caliper needs the three sites and the age', () => {
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    act(() => button(host, 'Caliper').click())
    for (const [k, v] of [['Chest', '12'], ['Abdomen', '20'], ['Thigh', '15']]) type(field(host, `${k} (mm)`), v)
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.bodyfat).toHaveLength(0)
    type(field(host, 'Age'), '30')
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.bodyfat[0]).toMatchObject({ m: 'jp3' })
    expect(useStore.getState().S.age).toBe(30)
  })

  it('writes nothing for an empty or impossible reading', () => {
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    act(() => button(host, 'Manual').click())
    act(() => button(host, 'Save').click())
    type(field(host, 'Body fat (%)'), '95')
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.bodyfat).toEqual([])
  })
})

describe('recent readings', () => {
  it('can be deleted from the sheet', () => {
    install({ bodyfat: [{ d: '2026-09-01', t: 1, pct: 20, m: 'manual' }] })
    act(() => bodyFatSheet())
    const host = mountTopSheet()
    act(() => host.querySelector('button[aria-label="Delete"]').click())
    expect(useStore.getState().S.bodyfat).toEqual([])
  })
})
