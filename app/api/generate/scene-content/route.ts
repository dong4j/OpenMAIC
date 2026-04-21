/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { retrieveTextbookContext } from '@/lib/textbook/retrieve';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

const SCENE_CONTENT_MAX_OUTPUT_TOKENS = 8192;
const SCENE_CONTENT_LLM_TIMEOUT_MS = 180_000;

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo: _stageInfo,
      stageId,
      agents,
      languageDirective,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      languageDirective?: string;
    };

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    const outline: SceneOutline = { ...rawOutline };

    // ── Model resolution from request headers ──
    const { model: languageModel, modelInfo, modelString } = await resolveModelFromHeaders(req);
    outlineTitle = rawOutline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: Math.min(
              modelInfo?.outputWindow ?? SCENE_CONTENT_MAX_OUTPUT_TOKENS,
              SCENE_CONTENT_MAX_OUTPUT_TOKENS,
            ),
            abortSignal: AbortSignal.timeout(SCENE_CONTENT_LLM_TIMEOUT_MS),
          },
          'scene-content',
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: Math.min(
            modelInfo?.outputWindow ?? SCENE_CONTENT_MAX_OUTPUT_TOKENS,
            SCENE_CONTENT_MAX_OUTPUT_TOKENS,
          ),
          abortSignal: AbortSignal.timeout(SCENE_CONTENT_LLM_TIMEOUT_MS),
        },
        'scene-content',
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    const textbookQuery = [
      effectiveOutline.title,
      effectiveOutline.description,
      ...(effectiveOutline.keyPoints || []),
    ].join('\n');
    const textbookStartedAt = Date.now();
    log.info(`Retrieving textbook context for content: "${effectiveOutline.title}"`);
    const textbookResult = await retrieveTextbookContext(textbookQuery, {
      mode: 'slide',
      maxChunks: 3,
      sourceChunkIds: effectiveOutline.sourceChunkIds,
    });
    log.info(
      `Textbook context ready for "${effectiveOutline.title}" in ${Date.now() - textbookStartedAt}ms: inScope=${textbookResult.inScope}, chunks=${textbookResult.chunks.length}, contextChars=${textbookResult.context.length}, topUnit=${textbookResult.topUnit?.theme ?? 'none'}, topScore=${textbookResult.topScore}, coverage=${textbookResult.coverage.toFixed(2)}`,
    );
    log.info(`Textbook query for content "${effectiveOutline.title}":\n${textbookQuery}`);
    log.info(`Textbook retrieval summary for content: ${textbookResult.retrievalSummary}`);
    log.info(`Textbook context for content "${effectiveOutline.title}":\n${textbookResult.context}`);

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    const generationStartedAt = Date.now();
    log.info(
      `Calling scene content generator: "${effectiveOutline.title}" (maxOutputTokens=${Math.min(
        modelInfo?.outputWindow ?? SCENE_CONTENT_MAX_OUTPUT_TOKENS,
        SCENE_CONTENT_MAX_OUTPUT_TOKENS,
      )}, timeoutMs=${SCENE_CONTENT_LLM_TIMEOUT_MS})`,
    );
    const content = await generateSceneContent(effectiveOutline, aiCall, {
      assignedImages,
      imageMapping,
      languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
      visionEnabled: hasVision,
      generatedMediaMapping,
      agents,
      languageDirective,
      textbookContext: textbookResult.context,
    });
    log.info(
      `Scene content generator returned for "${effectiveOutline.title}" in ${Date.now() - generationStartedAt}ms`,
    );

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
      );
    }

    log.info(
      `Content generated successfully: "${effectiveOutline.title}" in ${Date.now() - requestStartedAt}ms`,
    );

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    log.error(
      `Scene content generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
