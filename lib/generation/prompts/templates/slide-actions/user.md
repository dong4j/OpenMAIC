Elements: {{elements}}
Title: {{title}}
Key Points: {{keyPoints}}
Description: {{description}}
{{courseContext}}
{{agents}}
{{userProfile}}

## Built-in Textbook Context
{{textbookContext}}

Use the textbook context as the source for the speaking script:
- The speech must explain the current page with concrete textbook concepts, methods, examples, or activity prompts.
- Do not add knowledge outside the textbook unless it is only a plain transition phrase.
- If the slide content is brief, enrich the speech from the textbook evidence above instead of repeating the visible text.
- Keep each segment focused on one teaching move: introduce, explain, connect example, ask question, or summarize.

**Language Directive**: {{languageDirective}}

Output as a JSON array directly (no explanation, no code fences, 5-10 segments):
[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"Opening speech content"}]
