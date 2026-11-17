import { PunktParameters, PunktTokenizer } from 'punkt'
import { english } from 'punkt-packs'

const tokenizer = new PunktTokenizer(new PunktParameters(english))

export function splitSentences(source: string): string[] {
  const parts = source.match(/[^。！？]+[。！？]*[”’」』）】]*|[。！？]+/gu) ?? []
  return parts
    .flatMap((part) => tokenizer.tokenize(part))
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence))
}
