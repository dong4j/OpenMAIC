Please generate scene outlines for a textbook-specific PPT/courseware generator.

---

## User Requirements (possibly enhanced by textbook retrieval)

{{requirement}}

---

{{userProfile}}

## Language Context

Infer the course language directive by applying the decision rules from the system prompt. Key reminders:
- Requirement language = teaching language (unless overridden by explicit request or learner context)
- Foreign language learning → teach in user's native language, not the target language
- PDF language does NOT override teaching language — translate/explain document content instead

---

## Reference Materials

### Built-in Textbook Context

{{textbookContext}}

### PDF Content Summary

{{pdfContent}}

### Available Images

{{availableImages}}

### Web Search Results

{{researchContext}}

{{teacherContext}}

---

## Output Requirements

You must first treat the built-in textbook context as the authoritative scope. The user's requirement may be very short, such as "沟通 PPT" or "讲诚信". In that case, expand it using the textbook context and build a complete teaching outline around the matched unit and sections.

Please automatically infer the following from the user requirements and textbook context:

- Course topic and core content
- Target audience and difficulty level
- Course duration (default 15-30 minutes if not specified)
- Teaching style (formal/casual/interactive/academic)
- Visual style (minimal/colorful/professional/playful)

Then output a JSON object with `languageDirective` and `outlines`. The outline is the first stage only: it should decide the lesson structure page by page. Later generation will use each outline item to create the detailed slide content.

Each scene in the `outlines` array must include:

```json
{
  "languageDirective": "2-5 sentence instruction describing the course language behavior",
  "outlines": [
    {
      "id": "scene_1",
      "type": "slide" or "quiz" or "interactive",
      "title": "Scene Title",
      "description": "Teaching purpose description",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "sourceChunkIds": ["tb_0001", "tb_0002"],
      "order": 1
    }
  ]
}
```

### Special Notes

0. **Textbook grounding**: This is a textbook-specific course generator. Use the built-in textbook context as the primary and authoritative source. Do not introduce concepts, cases, definitions, or examples that are not supported by the textbook context. If PDF or web search content is present, it may only supplement the textbook and must not override it.
0.1. **For simple requirements**: If the user only names a broad topic, generate a balanced outline from the matched textbook unit: concept introduction, value/meaning, common problems, practical methods, classroom activity or reflection, and a short assessment.
0.2. **For detailed requirements**: Preserve the user's requested angle, but only use textbook-supported material.
0.3. **Source traceability**: Add `sourceChunkIds` whenever the textbook context includes chunk IDs like `[tb_0001]`. Use only chunk IDs that are relevant to that scene.
1. **quiz scenes must include quizConfig**:
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple"]
   }
   ```
2. **If images are available**, add `suggestedImageIds` to relevant slide scenes
3. **Interactive scenes**: If a concept benefits from hands-on simulation/visualization, use `"type": "interactive"` with `widgetType` and `widgetOutline` fields. Limit to 1-2 per course.
   - Select widgetType based on concept: simulation (physics/chem), diagram (processes), code (programming), game (practice), visualization3d (3D models)
   - Provide appropriate widgetOutline for the widget type
4. **Scene count**: Based on inferred duration, typically 1-2 scenes per minute
5. **Quiz placement**: Recommend inserting a quiz every 3-5 slides for assessment
6. **Language**: Infer from the user's requirement text and context, then output all content in the inferred language
7. **If no suitable PDF images exist** for a slide scene that would benefit from visuals, add `mediaGenerations` array with image generation prompts. Write prompts in English. Use `elementId` format like "gen_img_1", "gen_img_2" — IDs must be **globally unique across all scenes** (do NOT restart numbering per scene). To reuse a generated image in a different scene, reference the same elementId without re-declaring it in mediaGenerations. Each generated image should be visually distinct — avoid near-identical media across slides.
8. **If web search results are provided**, reference specific findings and sources in scene descriptions and keyPoints. The search results provide up-to-date information — incorporate it to make the course content current and accurate.

{{mediaGenerationPolicy}}

Please output a JSON object with `languageDirective` (string) and `outlines` (array) directly without additional explanatory text.
