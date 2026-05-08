export function chunkMessage(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const paragraphs = text.split(/\n{2,}/g);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      current = '';
    }

    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }

    // Fallback split for oversized paragraph.
    const sentences = paragraph.split(/(?<=[.!?])\s+/g);
    let sentenceChunk = '';
    for (const sentence of sentences) {
      const sentenceCandidate =
        sentenceChunk.length === 0 ? sentence : `${sentenceChunk} ${sentence}`;
      if (sentenceCandidate.length <= maxLength) {
        sentenceChunk = sentenceCandidate;
      } else {
        if (sentenceChunk.length > 0) chunks.push(sentenceChunk);
        if (sentence.length <= maxLength) {
          sentenceChunk = sentence;
        } else {
          for (let i = 0; i < sentence.length; i += maxLength) {
            chunks.push(sentence.slice(i, i + maxLength));
          }
          sentenceChunk = '';
        }
      }
    }
    if (sentenceChunk.length > 0) current = sentenceChunk;
  }

  if (current.length > 0) chunks.push(current);
  if (chunks.length <= 1) return chunks;

  return chunks.map((chunk, index) => {
    if (index === 0) return `${chunk}\n\n(...continued)`;
    if (index === chunks.length - 1) return `(...continued)\n\n${chunk}`;
    return `(...continued)\n\n${chunk}\n\n(...continued)`;
  });
}

