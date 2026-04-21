# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Key Points**:
  {{keyPoints}}

{{teacherContext}}

## Built-in Textbook Context

{{textbookContext}}

## Available Resources

- **Available Images**: {{assignedImages}}
- **Canvas Size**: {{canvas_width}} × {{canvas_height}} px

## Output Requirements

Based on the scene information and built-in textbook context above, generate a complete Canvas/PPT component for one page.

## Language Directive
{{languageDirective}}

**Must Follow**:

1. Output pure JSON directly, without any explanation or description
2. Do not wrap with ```json code blocks
3. Do not add any text before or after the JSON
4. Ensure the JSON format is correct and can be parsed directly
5. Use the provided image_id (e.g., `img_001`) for the `src` field of image elements
6. All TextElement `height` values must be selected from the quick reference table in the system prompt
7. The slide must be grounded in the built-in textbook context. Do not add external concepts, cases, definitions, or examples that are not supported by the textbook context.
8. Use the textbook summary points to decide the page structure, then use the selected original excerpts/evidence to add concrete explanation, example details, method steps, activity prompts, or comparison points. Do not generate a page that only restates the summary.
9. Keep this page focused on the current scene. Do not attempt to cover the whole unit on one page.
10. If the context includes case/activity/method material, convert it into a useful slide layout such as "concept + example", "problem + method", "case + reflection", or "steps + practice". Avoid generic bullets.
11. The slide should be visually complete and instructionally dense enough for teaching, but still readable on a single 16:9 page.

**Output Structure Example**:
{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>Title Content</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<p style=\"font-size:18px;\">• Point One</p><p style=\"font-size:18px;\">• Point Two</p><p style=\"font-size:18px;\">• Point Three</p>","defaultFontName":"","defaultColor":"#333333"}]}
