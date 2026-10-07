// @vitest-environment happy-dom
// Body measurements: the log sheet writes cm whatever unit it shows, only the tracked sites are
// asked for, and the history sheet reads them back in the profile's length unit.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { measureSheet, measuresSheet } from './sheets.jsx'
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
  Object.assign(S, { unit: 'kg', measures: [] }, extra)
  useStore.setState({ S, user: null })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toasts: [] })
  document.body.innerHTML = ''
  install()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('the log sheet', () => {
  it('saves what was typed, in cm, and leaves the empty sites out', () => {
    act(() => measureSheet())
    const host = mountTopSheet()
    type(field(host, 'Waist (cm)'), '82.5')
    type(field(host, 'Hips (cm)'), '96')
    act(() => button(host, 'Save').click())
    const [m] = useStore.getState().S.measures
    expect(m.d).toBe(todayISO())
    expect(m.v).toEqual({ waist: 82.5, hips: 96 })
  })

  it('in inches, stores the same body in cm', () => {
    install({ unit: 'lb' })
    act(() => measureSheet())
    const host = mountTopSheet()
    type(field(host, 'Waist (in)'), '32')
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.measures[0].v).toEqual({ waist: 81.28 })
  })

  it('asks only for the tracked sites', () => {
    install({ measureSites: ['waist', 'hips'] })
    act(() => measureSheet())
    const host = mountTopSheet()
    expect(field(host, 'Waist (cm)')).toBeTruthy()
    expect(field(host, 'Chest (cm)')).toBeNull()
  })

  it('writes nothing, and keeps the sheet, when nothing was filled in', () => {
    act(() => measureSheet())
    const host = mountTopSheet()
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.measures).toEqual([])
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('writes nothing for a value no tape could read', () => {
    act(() => measureSheet())
    const host = mountTopSheet()
    type(field(host, 'Waist (cm)'), '900')
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.measures).toEqual([])
  })

  it('brings today’s readings back to be corrected', () => {
    install({ measures: [{ d: todayISO(), t: 1, v: { waist: 82 } }] })
    act(() => measureSheet())
    const host = mountTopSheet()
    expect(field(host, 'Waist (cm)').value).toBe('82')
    type(field(host, 'Waist (cm)'), '81')
    act(() => button(host, 'Save').click())
    expect(useStore.getState().S.measures).toHaveLength(1)
    expect(useStore.getState().S.measures[0].v.waist).toBe(81)
  })
})

describe('the history sheet', () => {
  it('reads readings back in the profile’s unit, newest day first', () => {
    install({ unit: 'lb', measures: [
      { d: '2026-09-01', t: 1, v: { waist: 83.82 } },
      { d: '2026-09-08', t: 2, v: { waist: 81.28, hips: 96.52 } },
    ] })
    act(() => measuresSheet())
    const host = mountTopSheet()
    expect([...host.querySelectorAll('[data-day]')].map(n => n.dataset.day)).toEqual(['2026-09-08', '2026-09-01'])
    expect(host.textContent).toContain('32 in')
    expect(host.textContent).toContain('38 in')
    expect(host.textContent).toContain('33 in')
  })
})
