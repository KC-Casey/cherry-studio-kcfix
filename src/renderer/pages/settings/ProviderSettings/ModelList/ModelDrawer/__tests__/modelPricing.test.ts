import { describe, expect, it } from 'vitest'

import { buildModelPricingFromDraft, createModelPricingDraft, updateModelPricingTier } from '../modelPricing'

describe('unknown model token pricing', () => {
  it('keeps absent and explicitly unknown prices blank rather than free', () => {
    expect(createModelPricingDraft(undefined).tiers[0]).toMatchObject({ inputPrice: '', outputPrice: '' })
    const draft = createModelPricingDraft({ input: { perMillionTokens: null }, output: { perMillionTokens: null } })
    expect(draft.tiers[0]).toMatchObject({ inputPrice: '', outputPrice: '' })
    expect(buildModelPricingFromDraft(undefined, draft, '$')).toMatchObject({
      errors: [{}],
      pricing: { input: { perMillionTokens: null }, output: { perMillionTokens: null } }
    })
  })
  it('edits one rate without inventing the other or discarding image pricing', () => {
    const pricing = {
      input: { perMillionTokens: null },
      output: { perMillionTokens: null },
      perImage: { price: 0.04, unit: 'image' as const }
    }
    const draft = updateModelPricingTier(createModelPricingDraft(pricing), 0, 'inputPrice', '2')
    expect(buildModelPricingFromDraft(pricing, draft, '$').pricing).toMatchObject({
      input: { perMillionTokens: 2 },
      output: { perMillionTokens: null },
      perImage: { price: 0.04 }
    })
  })
  it('preserves explicit zero and rejects invalid prices', () => {
    const draft = createModelPricingDraft({ input: { perMillionTokens: 0 }, output: { perMillionTokens: 0 } })
    expect(draft.tiers[0]).toMatchObject({ inputPrice: '0', outputPrice: '0' })
    expect(buildModelPricingFromDraft(undefined, draft, '$').pricing?.input.perMillionTokens).toBe(0)
    for (const value of ['-1', 'invalid', 'Infinity']) {
      expect(
        buildModelPricingFromDraft(undefined, updateModelPricingTier(draft, 0, 'inputPrice', value), '$')
      ).toMatchObject({ errors: [{ inputPrice: 'invalidPrice' }] })
    }
  })
})
