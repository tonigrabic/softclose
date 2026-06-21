/**
 * The hypothesis call cross-references TWO images: the render (the design we
 * price) and the anchor photo (true scale + window/door positions). These pin
 * the pure message assembly so a regression can't silently drop the anchor or
 * reorder the images (render MUST be first — see the SYSTEM prompt).
 */
import { describe, expect, test } from 'vitest'
import { buildHypothesisMessages } from '@/app/api/builder-hypothesis/route'

const RENDER = 'data:image/png;base64,RENDER'
const ANCHOR = 'data:image/jpeg;base64,ANCHOR'

function imageParts(messages: ReturnType<typeof buildHypothesisMessages>) {
  return messages[0].content.filter((p) => p.type === 'image')
}
function textPart(messages: ReturnType<typeof buildHypothesisMessages>) {
  const part = messages[0].content.find((p) => p.type === 'text')
  return part && part.type === 'text' ? part.text : ''
}

describe('buildHypothesisMessages', () => {
  test('render first, anchor second, when both are present', () => {
    const messages = buildHypothesisMessages({
      renderImage: RENDER,
      anchorPhoto: ANCHOR,
      profileSummary: '{}',
      layoutFacts: '',
    })
    const images = imageParts(messages)
    expect(images).toHaveLength(2)
    expect(images[0].image).toBe(RENDER) // the design comes first
    expect(images[1].image).toBe(ANCHOR) // the reality check second
    // the text tells the model what the second image is for
    expect(textPart(messages)).toMatch(/ANCHOR PHOTO/i)
  })

  test('render only, when no anchor photo is available', () => {
    const messages = buildHypothesisMessages({
      renderImage: RENDER,
      profileSummary: '{}',
      layoutFacts: '',
    })
    const images = imageParts(messages)
    expect(images).toHaveLength(1)
    expect(images[0].image).toBe(RENDER)
    expect(textPart(messages)).not.toMatch(/ANCHOR PHOTO/i)
  })

  test('layout scale-hint text is prepended when supplied', () => {
    const messages = buildHypothesisMessages({
      renderImage: RENDER,
      profileSummary: '{}',
      layoutFacts: 'APPROXIMATE LAYOUT of the EXISTING space',
    })
    expect(textPart(messages).startsWith('APPROXIMATE LAYOUT')).toBe(true)
  })
})
