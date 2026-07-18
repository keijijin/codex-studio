import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { enableSystemCaCertificates, getSystemCaFetch } from './system-ca-fetch'

enableSystemCaCertificates()

function clientFetchOptions(): { fetch?: typeof globalThis.fetch } {
  const fetchImpl = getSystemCaFetch()
  return fetchImpl ? { fetch: fetchImpl } : {}
}

export function createOpenAIClient(options: {
  apiKey: string
  baseURL?: string
}): OpenAI {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    ...clientFetchOptions(),
  })
}

export function createAnthropicClient(options: { apiKey: string }): Anthropic {
  return new Anthropic({
    apiKey: options.apiKey,
    ...clientFetchOptions(),
  })
}
