# Humanizer — pattern reference

Before/after examples for each tell. The agent reads this file **only when a pattern in SKILL.md is ambiguous**.

Derived from Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) guide (WikiProject AI Cleanup), plus plain-speech extensions (#30–34).

---

## Content patterns

### 1. Significance inflation

**Watch:** stands/serves as, testament, pivotal moment, vital/crucial role, underscores importance, evolving landscape, setting the stage for, indelible mark, deeply rooted

**Before:**
> The Statistical Institute of Catalonia was officially established in 1989, marking a pivotal moment in the evolution of regional statistics in Spain. This initiative was part of a broader movement across Spain to decentralize administrative functions and enhance regional governance.

**After:**
> The Statistical Institute of Catalonia was established in 1989 to collect and publish regional statistics independently from Spain's national statistics office.

### 2. Notability name-dropping

**Watch:** independent coverage, media outlets listed without context, leading expert, active social media presence

**Before:**
> Her views have been cited in The New York Times, BBC, Financial Times, and The Hindu. She maintains an active social media presence with over 500,000 followers.

**After:**
> In a 2024 New York Times interview, she argued that AI regulation should focus on outcomes rather than methods.

### 3. Superficial -ing phrases

**Watch:** highlighting…, ensuring…, reflecting…, showcasing…, fostering…, symbolizing…

**Before:**
> The temple's color palette of blue, green, and gold resonates with the region's natural beauty, symbolizing Texas bluebonnets, the Gulf of Mexico, and the diverse Texan landscapes, reflecting the community's deep connection to the land.

**After:**
> The temple uses blue, green, and gold colors. The architect said these were chosen to reference local bluebonnets and the Gulf coast.

### 4. Promotional language

**Watch:** boasts, vibrant, nestled, breathtaking, groundbreaking, renowned, stunning, must-visit, in the heart of

**Before:**
> Nestled within the breathtaking region of Gonder in Ethiopia, Alamata Raya Kobo stands as a vibrant town with a rich cultural heritage and stunning natural beauty.

**After:**
> Alamata Raya Kobo is a town in the Gonder region of Ethiopia, known for its weekly market and 18th-century church.

### 5. Vague attributions

**Watch:** Industry reports, Experts believe, Observers have cited, Some critics argue

**Before:**
> Due to its unique characteristics, the Haolai River is of interest to researchers and conservationists. Experts believe it plays a crucial role in the regional ecosystem.

**After:**
> The Haolai River supports several endemic fish species, according to a 2019 survey by the Chinese Academy of Sciences.

### 6. Formulaic challenges sections

**Watch:** Despite its… faces several challenges…, Despite these challenges… continues to thrive, Future Outlook

**Before:**
> Despite its industrial prosperity, Korattur faces challenges typical of urban areas, including traffic congestion and water scarcity. Despite these challenges, with its strategic location and ongoing initiatives, Korattur continues to thrive as an integral part of Chennai's growth.

**After:**
> Traffic congestion increased after 2015 when three new IT parks opened. The municipal corporation began a stormwater drainage project in 2022 to address recurring floods.

---

## Language patterns

### 7. AI vocabulary

**Watch:** additionally, crucial, delve, enduring, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry, testament, underscore, vibrant

**Before:**
> Additionally, a distinctive feature of Somali cuisine is the incorporation of camel meat. An enduring testament to Italian colonial influence is the widespread adoption of pasta in the local culinary landscape, showcasing how these dishes have integrated into the traditional diet.

**After:**
> Somali cuisine also includes camel meat, which is considered a delicacy. Pasta dishes, introduced during Italian colonization, remain common, especially in the south.

### 8. Copula avoidance

**Watch:** serves as, stands as, boasts, features (when "is" or "has" works)

**Before:**
> Gallery 825 serves as LAAA's exhibition space for contemporary art. The gallery features four separate spaces and boasts over 3,000 square feet.

**After:**
> Gallery 825 is LAAA's exhibition space for contemporary art. The gallery has four rooms totaling 3,000 square feet.

### 9. Negative parallelisms and tail negations

**Watch:** It's not just X, it's Y; Not only… but…; clipped fragments like "no guessing"

**Before:**
> It's not just about the beat riding under the vocals; it's part of the aggression and atmosphere.

**After:**
> The heavy beat adds to the aggressive tone.

**Before (tail negation):**
> The options come from the selected item, no guessing.

**After:**
> The options come from the selected item without forcing the user to guess.

### 10. Rule of three

**Before:**
> The event features keynote sessions, panel discussions, and networking opportunities. Attendees can expect innovation, inspiration, and industry insights.

**After:**
> The event includes talks and panels. There's also time for informal networking between sessions.

### 11. Synonym cycling

**Before:**
> The protagonist faces many challenges. The main character must overcome obstacles. The central figure eventually triumphs. The hero returns home.

**After:**
> The protagonist faces many challenges but eventually triumphs and returns home.

### 12. False ranges

**Watch:** from X to Y where X and Y aren't on a meaningful scale

**Before:**
> Our journey through the universe has taken us from the singularity of the Big Bang to the grand cosmic web, from the birth and death of stars to the enigmatic dance of dark matter.

**After:**
> The book covers the Big Bang, star formation, and current theories about dark matter.

### 13. Passive voice and subjectless fragments

**Before:**
> No configuration file needed. The results are preserved automatically.

**After:**
> You do not need a configuration file. The system preserves the results automatically.

---

## Style patterns

### 14. Em dash overuse

Prefer periods, commas, semicolons, or hyphens. Don't swap em dashes for parenthesis piles or semicolon avalanches.

**Before:**
> The term is primarily promoted by Dutch institutions—not by the people themselves. You don't say "Netherlands, Europe" as an address—yet this mislabeling continues—even in official documents.

**After:**
> The term is primarily promoted by Dutch institutions, not by the people themselves. You don't say "Netherlands, Europe" as an address, yet this mislabeling continues in official documents.

### 15. Colon overuse (mid-sentence crutch)

Colons are fine before a list or example. Not as mid-sentence comparison connectors.

**Before:**
> If you're coming from traditional automation: instead of registering event handlers, you describe conditions.

**After:**
> Describing when the scheduler should fire works best as plain English, not as a pile of event handlers.

### 16. Boldface overuse

**Before:**
> It blends **OKRs (Objectives and Key Results)**, **KPIs (Key Performance Indicators)**, and visual strategy tools such as the **Business Model Canvas (BMC)**.

**After:**
> It blends OKRs, KPIs, and visual strategy tools like the Business Model Canvas and Balanced Scorecard.

### 17. Inline-header lists (restating)

**Bad (tell):**
> - **User Experience:** The user experience has been significantly improved with a new interface.
> - **Performance:** Performance has been enhanced through optimized algorithms.

**After:**
> The update improves the interface, speeds up load times through optimized algorithms, and adds end-to-end encryption.

**OK (not a tell):**
> **Schema in TypeScript.** Tables live in one file.

### 18. Title Case headings

**Before:** `## Strategic Negotiations And Global Partnerships`
**After:** `## Strategic negotiations and global partnerships`

### 19. Decorative emojis

**Before:**
> - 🚀 **Launch Phase:** The product launches in Q3
> - 💡 **Key Insight:** Users prefer simplicity

**After:**
> The product launches in Q3. User research showed a preference for simplicity.

### 20. Curly quotation marks

Replace `"` `"` with `"` and `'` with `'` in prose and especially in code/JSON/shell contexts.

---

## Communication patterns

### 21. Chatbot artifacts

**Watch:** I hope this helps, Let me know if…, Of course!, Certainly!, Here is a…

**Before:**
> Here is an overview of the French Revolution. I hope this helps! Let me know if you'd like me to expand on any section.

**After:**
> The French Revolution began in 1789 when financial crisis and food shortages led to widespread unrest.

### 22. Knowledge-cutoff disclaimers

**Watch:** While specific details are limited…, based on available information…, as of my last update…

**Before:**
> While specific details about the company's founding are not extensively documented in readily available sources, it appears to have been established sometime in the 1990s.

**After:**
> The company was founded in 1994, according to its registration documents.

### 23. Sycophantic tone

**Before:**
> Great question! You're absolutely right that this is a complex topic. That's an excellent point about the economic factors.

**After:**
> The economic factors you mentioned are relevant here.

---

## Filler and hedging

### 24. Filler phrases

- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
- "At this point in time" → "Now"
- "The system has the ability to process" → "The system can process"
- "It is important to note that the data shows" → "The data shows"

### 25. Excessive hedging

**Before:**
> It could potentially possibly be argued that the policy might have some effect on outcomes.

**After:**
> The policy may affect outcomes.

### 26. Generic positive conclusions

**Before:**
> The future looks bright for the company. Exciting times lie ahead as they continue their journey toward excellence.

**After:**
> The company plans to open two more locations next year.

### 27. Stacked compound modifiers

The tell is mechanical uniformity, not hyphens themselves. Don't strip required hyphens (`cross-functional team`).

**Before:**
> The cross-functional team delivered a high-quality, data-driven report on our client-facing tools. Their decision-making process was well-known for being thorough and detail-oriented.

**After:**
> The team pulled people from design, engineering, and sales, and the report leaned heavily on the metrics from our customer-facing tools. Everyone knew their process was thorough, sometimes to a fault.

---

## Framing patterns

### 28. Persuasive authority tropes

**Watch:** The real question is, at its core, what really matters, fundamentally, the heart of the matter

**Before:**
> The real question is whether teams can adapt. At its core, what really matters is organizational readiness.

**After:**
> The question is whether teams can adapt. That mostly depends on whether the organization is ready to change its habits.

### 29. Signposting

**Watch:** Let's dive in, let's explore, here's what you need to know, without further ado

**Before:**
> Let's dive into how caching works in Next.js. Here's what you need to know.

**After:**
> Next.js caches data at multiple layers, including request memoization, the data cache, and the router cache.

### 30. Fragmented headers

**Before:**
> ## Performance
>
> Speed matters.
>
> When users hit a slow page, they leave.

**After:**
> ## Performance
>
> When users hit a slow page, they leave.

---

## Plain speech (extensions)

### 31. Abstract metaphor jargon

**Watch:** substrate, wedge, vector (metaphor), locus, nexus, primitive (as noun), harness (metaphor), bedrock, scaffolding (metaphor), modality, paradigm, surface (as in "API surface")

**Before:**
> Drizzle provides a lightweight substrate for type-safe queries and a vector for schema migrations.

**After:**
> Drizzle gives you typed queries in TypeScript and generates migration SQL from schema changes.

### 32. Vague product copy (feeling vs mechanism)

**Before:**
> The database stays close at hand, with SQL you can read and types that follow your schema.

**After:**
> `.toSQL()` returns the exact string sent to the database. A column rename fails the build.

**Rule:** Ask what the sentence tells the reader to do or know. If you can't restate it as a concrete instruction, fact, or number, cut or rewrite it.

### 33. Dense sentences

**Before:**
> When the reader has to backtrack to parse a sentence, the fix is usually to break it in two or drop a clause rather than add another qualifier.

**After:**
> If a sentence needs a second read, split it. One idea per sentence.

### 34. Weak adverbs and fancy synonyms

- "runs quickly" → "is fast" or the measured number
- "significantly improves" → the measured delta
- utilize → use, leverage → use, facilitate → help, numerous → many, in the event that → if

Passive voice: prefer active when the actor clarifies ("queries are validated" → "the compiler validates queries"). Passive is fine when the actor is unknown or irrelevant.
