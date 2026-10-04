/**
 * IMP-02 proof only: a deliberately failing test, pushed to show the gate
 * turns red on a pull request. Reverted in the next commit.
 */
import { expect, test } from 'vitest'

test('the CI gate reports a failing test as a red check', () => {
  expect(1 + 1).toBe(3)
})
