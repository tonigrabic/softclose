/**
 * `/builder` is a development-only test harness for the builder, not a product
 * route. The builder lives inside the funnel (`/`) as Act 2 of the journey, so
 * the only product entry point is `/`. In production this route 404s; in
 * development it renders the fixture harness.
 */
import { notFound } from 'next/navigation'
import { BuilderHarness } from './harness'

export default function BuilderHarnessPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <BuilderHarness />
}
