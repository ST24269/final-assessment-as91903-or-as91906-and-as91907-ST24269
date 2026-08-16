const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ONBOARDING_CARD_PATTERN } = require('../server/src/routes/attendance')

test('accepts a typical uppercase hex card UID', () => {
  assert.equal(ONBOARDING_CARD_PATTERN.test('04A3B2C1D5'), true)
})

test('rejects UIDs shorter than 3 characters', () => {
  assert.equal(ONBOARDING_CARD_PATTERN.test('AB'), false)
})

test('rejects lowercase (cards are normalised to uppercase before this check)', () => {
  assert.equal(ONBOARDING_CARD_PATTERN.test('04a3b2c1d5'), false)
})

test('rejects characters outside A-Z, 0-9, _ and -', () => {
  assert.equal(ONBOARDING_CARD_PATTERN.test('CARD#123'), false)
})
