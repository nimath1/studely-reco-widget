import {
  toOptionalBoolean,
  toOptionalInt,
  toOptionalNumber,
  toOptionalTrimmed,
  toPositiveInt
} from './dto-transforms.util'

describe('dto transforms', () => {
  it('trims strings and drops empty or non-string values', () => {
    expect(toOptionalTrimmed('  caces ')).toBe('caces')
    expect(toOptionalTrimmed('   ')).toBeUndefined()
    expect(toOptionalTrimmed(12)).toBeUndefined()
  })

  it('parses positive integers with a fallback', () => {
    expect(toPositiveInt(undefined, 1)).toBe(1)
    expect(toPositiveInt('', 20)).toBe(20)
    expect(toPositiveInt('3', 1)).toBe(3)
    expect(toPositiveInt('3.5', 1)).toBeNaN()
  })

  it('parses optional integers and numbers', () => {
    expect(toOptionalInt(null)).toBeUndefined()
    expect(toOptionalInt('7')).toBe(7)
    expect(toOptionalInt('abc')).toBeNaN()
    expect(toOptionalInt('1.5')).toBeNaN()
    expect(toOptionalNumber('')).toBeUndefined()
    expect(toOptionalNumber('1.5')).toBe(1.5)
    expect(toOptionalNumber('x')).toBeNaN()
  })

  it('parses optional booleans and passes through invalid values', () => {
    expect(toOptionalBoolean(undefined)).toBeUndefined()
    expect(toOptionalBoolean(true)).toBe(true)
    expect(toOptionalBoolean('YES')).toBe(true)
    expect(toOptionalBoolean('0')).toBe(false)
    expect(toOptionalBoolean('maybe')).toBe('maybe' as unknown as boolean)
  })
})
