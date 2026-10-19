import { makeFormatters } from './format'

it('formate les nombres dans la locale active', () => {
  expect(makeFormatters('en').number(1.5)).toBe('1.5')
  expect(makeFormatters('de').number(1.5)).toBe('1,5')
})

it('formate les dates dans la locale active', () => {
  const fmt = makeFormatters('en')
  expect(fmt.date(new Date('2026-09-01'))).toContain('September')
  expect(makeFormatters('de').date(1788000000000)).toBeTruthy()
})
