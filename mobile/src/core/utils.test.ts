import { describe, expect, it } from 'vitest'
import { isReasonableQuery } from './utils'

describe('recent searches', () => {
  it('keeps normal searches and drops junk or essays', () => {
    expect(isReasonableQuery('lays')).toBe(true)
    expect(isReasonableQuery('amul butter 500 g')).toBe(true)
    expect(isReasonableQuery('a')).toBe(false)
    expect(isReasonableQuery('@@@ !!! %%%')).toBe(false)
    expect(isReasonableQuery('a'.repeat(120))).toBe(false)
  })
})
