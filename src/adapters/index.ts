import type { Adapter } from '@/lib/types'
import { mockAdapters } from './mock'

/**
 * The adapter list the app searches. Phase 2 swaps each mock for a live adapter
 * (e.g. `createBlinkitAdapter()`) once docs/platforms/<platform>.md has a verdict of A or B.
 */
export const adapters: Adapter[] = mockAdapters

export const IS_SAMPLE_DATA = true
