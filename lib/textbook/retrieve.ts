import fs from 'node:fs/promises';
import path from 'node:path';
import { TEXTBOOK_TOPICS, type TextbookTopic } from './topics';

export type TextbookChunk = {
  id: string;
  unitNo: number;
  unitTitle: string;
  sectionTitle: string;
  headingPath: string[];
  text: string;
  summaryPoints: string[];
};

export type TextbookIndex = {
  sourcePath: string;
  chunks: TextbookChunk[];
};

export type RetrievedTextbookChunk = {
  chunk: TextbookChunk;
  score: number;
};

export type TextbookRetrievalResult = {
  inScope: boolean;
  context: string;
  chunks: RetrievedTextbookChunk[];
  topUnit?: TextbookTopic;
  topScore: number;
  coverage: number;
  enhancedRequirement: string;
  retrievalSummary: string;
  reason?: string;
};

export type TextbookContextMode = 'outline' | 'slide' | 'actions';

const TEXTBOOK_PATH = path.join(process.cwd(), 'content', 'textbook', 'main.cleaned.md');
const MAX_CHARS_PER_CHUNK = 2600;
const MAX_CONTEXT_CHARS = 9000;

let cachedIndex: TextbookIndex | null = null;

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
    .replace(/[^\u4e00-\u9fa5a-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  const englishWords = normalized.match(/[a-z0-9_]{2,}/g) || [];
  const chinese = normalized.replace(/[^\u4e00-\u9fa5]/g, '');
  const chineseTokens = new Set<string>();

  for (let i = 0; i < chinese.length; i++) {
    chineseTokens.add(chinese[i]);
    if (i + 1 < chinese.length) chineseTokens.add(chinese.slice(i, i + 2));
    if (i + 2 < chinese.length) chineseTokens.add(chinese.slice(i, i + 3));
  }

  return [...englishWords, ...chineseTokens].filter((token) => token.length >= 2);
}

function headingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s+/);
  return match ? match[1].length : 0;
}

function stripHeading(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

function unitNoFromTitle(title: string): number | null {
  const numerals: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const match = title.match(/^第([一二三四五六七八九十]+)单元/);
  if (!match) return null;
  return numerals[match[1]] ?? null;
}

function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const parts: string[] = [];
  let buffer = '';

  for (const paragraph of paragraphs) {
    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      buffer = next;
      continue;
    }
    if (buffer) parts.push(buffer);
    buffer = paragraph;
  }

  if (buffer) parts.push(buffer);
  return parts.flatMap((part) => {
    if (part.length <= maxChars) return [part];
    const slices: string[] = [];
    for (let i = 0; i < part.length; i += maxChars) slices.push(part.slice(i, i + maxChars));
    return slices;
  });
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？；])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12);
}

function buildSummaryPoints(text: string, headingPath: string[], maxPoints = 5): string[] {
  const headingText = headingPath.join(' ');
  const headingTokens = new Set(tokenize(headingText));
  const sentences = splitSentences(text);

  const scored = sentences
    .map((sentence, index) => {
      const normalized = normalizeText(sentence);
      let score = Math.max(0, 20 - index);
      for (const token of headingTokens) {
        if (normalized.includes(token)) score += token.length >= 3 ? 8 : 3;
      }
      if (/是|指|表现为|要求|需要|关键|核心|方法|步骤|技巧|价值|意义/.test(sentence)) {
        score += 10;
      }
      if (/职场|工作|沟通|协作|诚信|敬业|自控|创新|学习|坚持|主动|踏实/.test(sentence)) {
        score += 8;
      }
      if (/《|“|”|曰|记载|原义|出处/.test(sentence)) {
        score -= 12;
      }
      if ((sentence.match(/[“”"《》]/g) || []).length >= 4) {
        score -= 16;
      }
      if (sentence.length > 120) score -= 8;
      return { sentence, score };
    })
    .sort((a, b) => b.score - a.score);

  const points: string[] = [];
  for (const item of scored) {
    const point = item.sentence.length > 120 ? `${item.sentence.slice(0, 118)}...` : item.sentence;
    if (!points.some((existing) => existing.includes(point) || point.includes(existing))) {
      points.push(point);
    }
    if (points.length >= maxPoints) break;
  }

  if (points.length > 0) return points;

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 12)
    .slice(0, maxPoints);
}

function isUsefulEnhancedPoint(point: string): boolean {
  if (point.length < 10) return false;
  if (/《|曰|记载|原义|出处/.test(point)) return false;
  if ((point.match(/[“”"《》]/g) || []).length >= 4) return false;
  return true;
}

function buildChunks(markdown: string): TextbookChunk[] {
  const lines = markdown.split('\n');
  const chunks: TextbookChunk[] = [];
  let unitNo = 0;
  let unitTitle = '绪论';
  let sectionTitle = '绪论';
  let headingPath: string[] = [unitTitle];
  let buffer: string[] = [];
  let seq = 0;

  const flush = () => {
    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text || text.length < 30) return;

    for (const part of splitLongText(text, MAX_CHARS_PER_CHUNK)) {
      chunks.push({
        id: `tb_${String(seq++).padStart(4, '0')}`,
        unitNo,
        unitTitle,
        sectionTitle,
        headingPath,
        text: part,
        summaryPoints: buildSummaryPoints(part, headingPath),
      });
    }
  };

  for (const line of lines) {
    const level = headingLevel(line);
    if (level > 0) {
      const title = stripHeading(line);
      const nextUnitNo = unitNoFromTitle(title);

      if (nextUnitNo !== null || level <= 4) flush();

      if (nextUnitNo !== null) {
        unitNo = nextUnitNo;
        unitTitle = title;
        sectionTitle = title;
        headingPath = [title];
      } else if (level === 1 || level === 2) {
        unitTitle = title;
        sectionTitle = title;
        headingPath = [title];
      } else if (level === 3) {
        sectionTitle = title;
        headingPath = unitTitle ? [unitTitle, title] : [title];
      } else {
        sectionTitle = title;
        headingPath = unitTitle ? [unitTitle, title] : [title];
      }
      continue;
    }

    buffer.push(line);
  }

  flush();
  return chunks;
}

export async function loadTextbookIndex(): Promise<TextbookIndex> {
  if (cachedIndex) return cachedIndex;
  const markdown = await fs.readFile(TEXTBOOK_PATH, 'utf8');
  cachedIndex = {
    sourcePath: TEXTBOOK_PATH,
    chunks: buildChunks(markdown),
  };
  return cachedIndex;
}

function scoreUnit(query: string, queryTokens: string[], topic: TextbookTopic): number {
  const normalizedQuery = normalizeText(query);
  let score = 0;

  for (const marker of topic.titleIncludes) {
    if (normalizedQuery.includes(normalizeText(marker))) score += 120;
  }

  for (const alias of topic.aliases) {
    const normalizedAlias = normalizeText(alias);
    if (normalizedQuery.includes(normalizedAlias)) score += alias.length <= 2 ? 55 : 80;
    for (const token of queryTokens) {
      if (normalizedAlias.includes(token) || token.includes(normalizedAlias)) score += 8;
    }
  }

  return score;
}

function scoreChunk(
  queryTokens: string[],
  chunk: TextbookChunk,
  preferredUnitNos: Set<number>,
): number {
  const title = normalizeText(
    `${chunk.unitTitle} ${chunk.sectionTitle} ${chunk.headingPath.join(' ')}`,
  );
  const text = normalizeText(chunk.text);
  let score = preferredUnitNos.has(chunk.unitNo) ? 25 : 0;

  if (preferredUnitNos.has(chunk.unitNo)) {
    if (/识读|价值|关键|技巧|步骤|方法|原则|成长路|面面观|加油站|职场/.test(chunk.sectionTitle)) {
      score += 35;
    }
    if (/案例导读|案例描述|案例分析|案例交流|拓展活动/.test(chunk.sectionTitle)) {
      score -= 18;
    }
  }

  for (const token of queryTokens) {
    if (title.includes(token)) score += 18;
    if (text.includes(token)) score += token.length >= 3 ? 4 : 2;
  }

  return score;
}

function queryCoverage(
  queryTokens: string[],
  chunks: RetrievedTextbookChunk[],
  topUnit?: TextbookTopic,
): number {
  if (queryTokens.length === 0) return 0;
  const haystack = normalizeText(
    [
      topUnit?.aliases.join(' ') || '',
      ...chunks
        .slice(0, 5)
        .map(({ chunk }) => `${chunk.unitTitle} ${chunk.sectionTitle} ${chunk.text}`),
    ].join('\n'),
  );
  const matched = queryTokens.filter((token) => haystack.includes(token));
  return matched.length / queryTokens.length;
}

function isSimpleQuery(query: string): boolean {
  const normalized = normalizeText(query);
  const withoutGenericWords = normalized
    .replace(/生成|制作|做|一份|一个|ppt|课件|课程|课堂|讲一下|介绍|关于/g, '')
    .trim();
  return withoutGenericWords.length <= 8;
}

function buildEnhancedRequirement(
  query: string,
  chunks: RetrievedTextbookChunk[],
  topUnit?: TextbookTopic,
): string {
  if (!topUnit || chunks.length === 0 || !isSimpleQuery(query)) return query;

  const sections = [...new Set(chunks.slice(0, 5).map(({ chunk }) => chunk.sectionTitle))]
    .filter(Boolean)
    .join('、');
  const points: string[] = [];
  for (const { chunk } of chunks) {
    const point = chunk.summaryPoints
      .map((item) => item.replace(/\s+/g, ' '))
      .find((item) => isUsefulEnhancedPoint(item));
    if (point && !points.some((existing) => existing.includes(point) || point.includes(existing))) {
      points.push(point);
    }
    if (points.length >= 8) break;
  }
  if (points.length < 6) {
    for (const { chunk } of chunks) {
      for (const rawPoint of chunk.summaryPoints) {
        const point = rawPoint.replace(/\s+/g, ' ');
        if (!point || points.some((existing) => existing.includes(point) || point.includes(existing))) {
          continue;
        }
        points.push(point);
        break;
      }
      if (points.length >= 8) break;
    }
  }

  return [
    `围绕教材《职业基本素养》中“${topUnit.theme}”主题生成课件。`,
    sections ? `重点覆盖教材栏目：${sections}。` : '',
    points.length > 0 ? `建议讲清这些教材观点：${points.join('；')}。` : '',
    `用户原始需求：${query}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildRetrievalSummary(chunks: RetrievedTextbookChunk[], topUnit?: TextbookTopic): string {
  const chunkSummary = chunks
    .slice(0, 5)
    .map(
      ({ chunk, score }) =>
        `${chunk.id}:${chunk.unitTitle} > ${chunk.sectionTitle} score=${score} points=${chunk.summaryPoints.length}`,
    )
    .join(' | ');
  return `topUnit=${topUnit?.theme ?? 'none'} chunks=[${chunkSummary}]`;
}

function classifyChunk(chunk: TextbookChunk) {
  const title = chunk.sectionTitle;
  const text = chunk.text;
  return {
    isCase: /案例|故事|拓展阅读/.test(title),
    isActivity: /拓展活动|初体验|讨论|游戏|活动/.test(title),
    isMethod: /方法|技巧|步骤|原则|成长路|怎么|如何|控制|培养|学会/.test(title + text),
    isConcept: /识读|价值|意义|内涵|定义|概念|关键|通行证|助推器/.test(title + text),
  };
}

function excerptForMode(chunk: TextbookChunk, mode: TextbookContextMode): string {
  const limit = mode === 'outline' ? 240 : mode === 'slide' ? 1000 : 1600;
  const text = chunk.text.trim();
  if (text.length <= limit) return text;

  const sentences = splitSentences(text);
  const classified = classifyChunk(chunk);
  const preferred = sentences.filter((sentence) => {
    if (classified.isMethod) return /方法|技巧|步骤|原则|需要|应当|可以|注意|做到/.test(sentence);
    if (classified.isCase) return /案例|故事|说明|反映|启示|问题|结果|后果/.test(sentence);
    if (classified.isActivity) return /活动|规则|讨论|问题|步骤|要求/.test(sentence);
    return /是|指|价值|意义|作用|表现为|关键|核心/.test(sentence);
  });
  const selected = (preferred.length > 0 ? preferred : sentences).join('');
  return selected.slice(0, limit);
}

function chunkRoleLabel(chunk: TextbookChunk): string {
  const classified = classifyChunk(chunk);
  const labels: string[] = [];
  if (classified.isConcept) labels.push('概念/价值');
  if (classified.isMethod) labels.push('方法/技巧');
  if (classified.isCase) labels.push('案例/阅读');
  if (classified.isActivity) labels.push('活动/讨论');
  return labels.length > 0 ? labels.join('、') : '教材材料';
}

function formatContext(chunks: RetrievedTextbookChunk[], mode: TextbookContextMode): string {
  let total = 0;
  const parts: string[] = [];

  for (const { chunk, score } of chunks) {
    const header = `[${chunk.id}] 单元：${chunk.unitTitle}\n栏目：${chunk.headingPath.join(
      ' > ',
    )}\n材料类型：${chunkRoleLabel(chunk)}\n相关度：${score}`;
    const points = chunk.summaryPoints.map((point, index) => `${index + 1}. ${point}`).join('\n');
    const excerpt = excerptForMode(chunk, mode);
    const part =
      mode === 'outline'
        ? `${header}\n可用于大纲的教材观点：\n${points || '无'}`
        : `${header}\n教材观点摘要：\n${points || '无'}\n精选原文/证据材料：\n${excerpt}`;
    if (total + part.length > MAX_CONTEXT_CHARS) break;
    parts.push(part);
    total += part.length;
  }

  return parts.join('\n\n---\n\n');
}

export async function retrieveTextbookContext(
  query: string,
  options?: { maxChunks?: number; mode?: TextbookContextMode; sourceChunkIds?: string[] },
): Promise<TextbookRetrievalResult> {
  const index = await loadTextbookIndex();
  const queryTokens = tokenize(query);
  const maxChunks = options?.maxChunks ?? 8;
  const mode = options?.mode ?? 'outline';
  const sourceChunkIds = options?.sourceChunkIds?.filter(Boolean) ?? [];

  const unitScores = TEXTBOOK_TOPICS
    .map((topic) => ({ topic, score: scoreUnit(query, queryTokens, topic) }))
    .sort((a, b) => b.score - a.score);
  const topUnitScore = unitScores[0]?.score ?? 0;
  const topUnit = unitScores[0]?.topic;
  const preferredUnitNos = new Set(
    unitScores
      .filter((item) => item.score > 0 && item.score >= topUnitScore * 0.45)
      .map((item) => item.topic.unitNo),
  );

  const rankedByQuery = index.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk, preferredUnitNos) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  const chunksById = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  const exactChunks = sourceChunkIds
    .map((id) => chunksById.get(id))
    .filter((chunk): chunk is TextbookChunk => Boolean(chunk))
    .map((chunk) => ({ chunk, score: 999 }));

  const seen = new Set<string>();
  const ranked = [...exactChunks, ...rankedByQuery]
    .filter(({ chunk }) => {
      if (seen.has(chunk.id)) return false;
      seen.add(chunk.id);
      return true;
    })
    .slice(0, maxChunks);

  const topChunkScore = ranked[0]?.score ?? 0;
  const topScore = Math.max(topUnitScore, topChunkScore);
  const exactTopUnitNo = exactChunks[0]?.chunk.unitNo;
  const exactTopUnit = exactTopUnitNo
    ? TEXTBOOK_TOPICS.find((topic) => topic.unitNo === exactTopUnitNo)
    : undefined;
  const effectiveTopUnit = exactTopUnit || (topUnitScore > 0 ? topUnit : undefined);
  const coverage = queryCoverage(queryTokens, ranked, effectiveTopUnit);
  const inScope = exactChunks.length > 0 || topScore >= 90 || (topScore >= 45 && coverage >= 0.4);
  const enhancedRequirement = inScope
    ? buildEnhancedRequirement(query, ranked, effectiveTopUnit)
    : query;
  const retrievalSummary = buildRetrievalSummary(ranked, effectiveTopUnit);

  return {
    inScope,
    context: inScope ? formatContext(ranked, mode) : '',
    chunks: ranked,
    topUnit: effectiveTopUnit,
    topScore,
    coverage,
    enhancedRequirement,
    retrievalSummary,
    reason: inScope
      ? `命中教材${topUnit ? `「${topUnit.theme}」` : ''}相关内容`
      : '未检索到足够的教材依据',
  };
}
