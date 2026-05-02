import { generateImage } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(req: Request) {
  if (process.env.ENABLE_CONCEPT_VISUALS !== 'true') {
    return Response.json(
      { error: 'Concept visuals are disabled in this environment.' },
      { status: 404 }
    )
  }

  try {
    const body = (await req.json()) as { prompt?: string }
    const userPrompt = body.prompt?.trim()
    if (!userPrompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 })
    }

    const fullPrompt = `${userPrompt}

Photorealistic residential kitchen interior, eye-level view, soft natural daylight, clean composition, no text, no watermarks. This is an exploratory concept reference for discussion — not a finished design or floor plan.`

    const { image } = await generateImage({
      model: openai.image('gpt-image-1'),
      prompt: fullPrompt,
      size: '1024x1024',
    })

    return Response.json({
      dataUrl: `data:${image.mediaType};base64,${image.base64}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
