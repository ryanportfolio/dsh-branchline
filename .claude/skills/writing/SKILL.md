---
name: writing
description: "Write or edit audience-facing prose: docs, UI copy, emails, release notes, and application answers. Use also for voice matching, clarity review, or AI-tell cleanup. Ordinary session replies follow session conventions."
---

# Writing

For prose that lives outside this session, read by someone who was not here. Write for the reader's next decision: find the job the text has to do, do it early, cut everything that does not help. Nothing that ships reads as machine-made, and nothing distinctive gets sanded off to get there.

Ordinary chat follows session conventions, including Caveman when configured. Deliverables, including commit and PR prose, use normal audience-appropriate language and repository conventions. Code, identifiers, error strings, and quotations remain exact. Use specialized artifact workflows where applicable.

## Precedence

1. The writer's own sample voice: mirror sentence length, register, punctuation, recurring phrases. Never upgrade casual to corporate.
2. An optional project voice reference identified by repository instructions, such as CLAUDE.md or AGENTS.md. Apply it only to that project's work; no particular voice file is required.
3. The rules below.

Explicit user choices override all style defaults, including punctuation. Preserve facts, uncertainty, quotations, identifiers, and technical meaning.

## Before drafting

Settle silently: who reads this; what they should understand, decide, or do; what the prompt really asks (a challenge question may want judgment, not chronology); hard constraints; which facts carry the answer. Lead with those facts.

Form follows the job. Application answer: answer, one example, what it reveals. Email: purpose, context, next step. Explanation: answer, then how. Proposal: problem, recommendation, why. Memo: decision, then implications. Bio: most relevant work first. Essay: a claim, then earn it. Product copy: the user's outcome, never the product describing itself.

If the piece depends on the author's experience or judgment, use supplied notes first. Ask only for missing material that could change the answer: a relevant event, observation, decision, or result. Never invent personal material. Routine or reference copy needs no interview.

For substantive claims and recommendations, check the main claim, its support, and any exception that changes the advice. Reuse supplied evidence and source logs; verify material factual claims against those sources or other reliable evidence within scope. Model agreement is not verification. Narrow unsupported claims, preserve consequential uncertainty, and identify evidence still needed. A sound recommendation needs no contrarian angle.

Keep these checks proportional and silent for routine drafting. A style-only request stays style-only: add no research or substantive rewrite, and imply no factual verification.

## Style defaults

Avoid the following patterns unless an explicit style choice overrides them. Style choices never permit invented facts or altered technical meaning.

- **Em dashes (U+2014), anywhere.** No en-dash or double-hyphen stand-ins. Period, comma, colon, semicolon, parentheses; middle dot (U+00B7) for label separators.
- **Trailing periods on headings** and display text.
- **Negation pivots, every disguise.** "Not just X, it's Y", "The point isn't X. It's Y", "Not a X. Not a Y. A Z." Splitting across sentences does not cure it. Delete the denial half, open with the point. A negation survives only when it corrects a misconception the reader holds, after the positive claim.
- **Negative-definition headings** ("Synthesis, not summary"). Say what it is.
- **Death metaphors** for removal. Words are cut, a model is retired, a file is gone.
- **Coinages and insider jargon.** Would a smart reader outside the domain have to ask? Use the plain phrase. A term the reader owns is fine, glossed once.
- **"Why this matters" labels.** Stakes live inside the prose.
- **Invented specificity.** No claims, numbers, quotes, or sources the material lacks. Mark `[needs source]` or ask.

## Tells

Mannered prose substitutes metaphor and flourish for direct statement: "a dial worth turning" for "a parameter worth varying". The phrases display the writer instead of conveying the idea, and readers can tell. Say what you mean; when a literal phrase exists, use it. The lists below name the recurring forms. Catalog with before/after examples in [patterns.md](patterns.md); open it when a tell is ambiguous.

- **Puffery and AI vocabulary.** pivotal, testament, landscape, groundbreaking, delve, crucial, showcase, robust, seamless, transformative, empower, streamline; leverage and utilize (use), facilitate (help). Full list: patterns 1, 4, 7.
- **Superficial -ing tails** ("highlighting the team's commitment"), **vague attribution** (experts agree), **copula dodges and inanimate actors** (serves as, "the decision emerged"), **fake structure** (rule of three, false ranges, synonym cycling).
- **Filler and empty adverbs.** in order to, it is important to note, at the end of the day, when it comes to, going forward; just, literally, honestly, actually, fundamentally. Hedging stacks collapse to one word. Pattern 25.
- **Rhetorical setups.** Throat-clearing ("Here's the thing", "Let me be clear"); faux-insight ("what nobody tells you"); colon reveals ("The best part: it learns."); dramatic fragmentation ("That's it. That's the whole thing."); self-answered questions, "Plot twist:"; metadiscourse ("this distinction matters", "as you can see"). State the point. Patterns 35-42.
- **Kicker endings and recaps.** A final aphorism or mic-drop line, "In conclusion". Delete; never rewrite into a better metaphor. End on the last concrete sentence or a plain next action.
- **Style tics.** Colon as mid-sentence hinge; bold on every noun; inline-header bullets that restate their label; Title Case headings; decorative emojis; curly quotes; uniform hyphenated compounds; bullets where prose reads better; a header over two sentences.
- **Marketing shapes.** "whether you're X or Y", "that's where X comes in", "say goodbye to", "imagine a", hedged benefits ("helps you to"), boilerplate CTAs, process bleed. Patterns 46-54.
- **Chatbot artifacts** (Great question, I hope this helps) and **abstract metaphor nouns** (substrate, wedge, paradigm, north star, flywheel). Pick the concrete word.

Words naming a real thing in the repo ("harness") are terms, not tells.

## Rules

- **Lead with the point.** If a paragraph's payoff could open it, move it up and cut the wind-up.
- **Say what it does, not how it feels.** Mechanism or number. A sentence that could move unchanged to another product or person is filler.
- **Protect the specific fact.** "Significantly faster" becomes the measured delta.
- **Show, do not label.** Cut commentary calling a point important, surprising, or subtle.
- **Earn every claim.** Never say passionate, innovative, hard-working, strategic, collaborative unless the sentence shows it.
- **Plain words, active voice, direct verbs.** "The compiler validates queries"; "decided", not "made a decision". Latinate dress-ups (prohibition, subsequent, corroborated, verbatim, ancillary, myriad) lose to the everyday phrase; pattern 31 lists the swaps. Never swap an accurate technical name for a vaguer one: precision wins only when the two truly conflict.
- **Keep sentences and paragraphs focused.** Length follows the form and the reader's needs. Split when ideas become hard to follow, not to meet a fixed sentence count.
- **State the rule, skip the flourish.** No aphorism capstones, no justifying self-evident rules.
- **Explain what the reader needs.** Include mechanisms when they help readers understand, act, troubleshoot, or assess a claim. Use enough examples to establish understanding; cut examples that add nothing.
- **Stranger test.** A word with a domain and an everyday meaning ("fine", "weight") reads as the everyday one. Describe the observable thing, then what it means.
- **Name the thing before framing it.** "We use a skill called caveman", then the concept, if at all.
- **Self-contained passages.** If a paragraph only lands for someone who saw the artifact, show it or cut the passage.
- **Never talk down.** No framing that explains the reader to themselves.
- **Word-tic sweep.** A word repeated across a draft means the prose orbits an abstraction; rewrite those sentences concretely.
- **Titles are plain and specific.** Say what the reader gets, unopened.
- **Keep a voice.** Have a view. Vary sentence and paragraph shape; identical shapes in a row read as generated. First person where genuine. Sterile clean prose is still a tell.
- **Tell the making as it happened.** How something was built is a fact; verify it like one.
- **Cut without losing understanding.** Prefer the shortest version that preserves meaning, necessary context, and ease of reading.

## Editing someone else's draft

- Read the whole draft first. Note the core point and the voice: vocabulary, cadence, bluntness, humor, uncertainty, digressions. Unclear point: ask one question.
- Minimum effective edit. Fix tells, errors, repetition, tangles. Leave strong human sentences alone; cut in proportion to the slop present.
- Keep real hedges ("I think", "maybe") when they express actual uncertainty or spoken rhythm.
- Keep edge: opinions, blunt language, profanity, self-interruptions, asides that create context or tension.
- Keep structure unless it hurts the piece; if you reorganize, say why.
- Keep meaning. No new claims; unsourced ones get removed or flagged, never given an invented source.
- Asked only whether it reads as AI: per finding, the quoted line, the pattern name, a fix in a few words. Use a Style-only verdict, with no rewrite, numeric score, or guess at authorship; named patterns are evidence, detectors guess.

## Reader-understanding review

For a requested substantive or clarity review, first restate what the intended reader can recover from the draft alone: its main point, any next action, and essential conditions or caveats. Mark unclear or missing meaning without supplying the author's intention. Compare with any supplied intended message only after recording the reader's interpretation. A clear draft may remain unchanged.

Unless the user specifies another format, begin the returned review with the review type and this restatement, before edited text or proposed replacements. Use a fresh reader only when available and authorized; give that reader the draft and audience before the intended interpretation. Call a review independent only when a fresh reader actually performed it. Reviewing your own draft or using prior author context is self-review. No separate skill is required.

For substantive review, check support, recoverable meaning, essential caveats, and whether each section adds useful information or helps the reader act before polishing style. Reuse evidence already checked. Style-only reviews stay within their requested scope and need no reader restatement. Routine drafting returns the deliverable without a review preamble.

## Review sweep, in order

Apply only unoverridden defaults; preserve requested voice and quoted or technical material.

1. Em dashes and stand-ins: replace every one.
2. Trailing periods off headings.
3. Negation pivots, including split-sentence forms.
4. Jargon and fancy words: glossed, owned by the reader, or replaced.
5. Paragraph focus and readability: split or cut where doing so improves understanding.
6. Per paragraph: which sentence performs instead of informs? Delete it.
7. Last line a kicker or recap? Delete; end on the last concrete point.
8. Stranger-test captions, labels, double-reading words.
9. Repeated abstract nouns: rewrite the leaning sentences.
10. Title says what the reader gets?

For an explicitly requested prose review, give **PASS** when no applicable, unoverridden requirement remains, otherwise **FAIL** with concrete violations or missing evidence. Overall PASS covers substance and style; missing required evidence prevents it. For a review limited to clarity or style, label the verdict **Clarity-only PASS/FAIL** or **Style-only PASS/FAIL** as appropriate; assess only that scope and do not imply factual verification. A clarity-only request needs no added research. Label notes **Requirement** or **Suggestion**. Ordinary drafting needs no verdict; a requested style is not a violation.

## Anti-patterns

- Trading one tell for another: em dashes into semicolon storms, a fancy word into a sidegrade synonym.
- Dropping a fact, caveat, or qualifier to remove a tell. Accuracy beats cleanliness.
- Sanitizing a distinctive voice into bland professional prose.
