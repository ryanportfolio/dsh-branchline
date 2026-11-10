# Critique questions

A fixed set of viewer questions for judging a finished piece, chosen by what kind of piece it is. Use them as the judged checks of a `wow-loop` contract, or as the checklist for a review by hand. They ask what the viewer gets; craft rules (easing, flash, timing numbers) stay in the other references.

## Pick the type

Pick the type with the story, before the beat sheet, so the decisive question shapes it. Record one line in `BRIEF.md`: `Type: pitch`, or two types joined with `+` (`Type: pitch + explainer`), next to the one-sentence feeling-and-job line. Two types get the union of their questions, each asked once. Pick by what the viewer should do when it ends:

| Type | The viewer ends up | Examples |
|---|---|---|
| pitch | wanting to act: visit, buy, install, play | promo, launch film, game trailer |
| explainer | knowing how something works or what it does | feature demo, product walkthrough |
| story | feeling something about a case or a person | case study, narrative film |
| game | having played: their input drives the picture | playable demo, interactive scene |
| tool | getting a task done on a screen that moves | a hero animation on a working page, a looping demo inside a live screen |

A game trailer is a pitch: the viewer watches it. Use `game` only when the viewer has input. Motion of product UI parts (buttons, popovers, toasts, drawers) follows [ui-components.md](ui-components.md), not these questions.

## Questions every piece gets

- `point`: Watched once, does the piece leave a single belief the viewer could repeat in plain words?
- `pace`: Is each shot or hold as long as its content needs and no longer, with changes timed to a word, a beat or an action?
- `read`: Can every word that matters be read at the size it ships, against what sits behind it, before it leaves?
- `own`: Hide the name and logo: is it still clearly about this subject, and not any product of its kind?
- `sound` (only when the piece has audio): Can the voice be heard over everything, with music and effects saved for moments that matter? With no voice: do music and effects drive the cut on the beat and stay clean?

## Questions by type

The decisive question is marked. A failure on it always fails the piece.

| Type | Adds |
|---|---|
| pitch | `open` (decisive), `shown`, `land` |
| explainer | `loop` (decisive), `open`, `shown`, `land` |
| story | `pull` (decisive), `open`, `land` |
| game | `feel` (decisive), `again` |
| tool | `task` (decisive) |

- `open`: Would the first 2 s stop this audience mid-scroll, and do they pose a question the piece goes on to answer?
- `shown`: Each time a caption or the voice makes a claim, is the real thing doing it on screen at that moment?
- `land`: When it ends, does the viewer know what to do now, or get the reward the opening promised?
- `loop`: Is it one project or task carried start to finish, each step causing the next, with no detour into a feature list?
- `pull`: Does every scene close on an open question that makes the next scene wanted?
- `feel`: Does the picture answer each input immediately and visibly enough for the player to tell what they did?
- `again`: When the player fails, can they see why, and retry with one action?
- `task`: Can someone do what the screen is for without hunting for where to look?

## Turning them into contract checks

- One judged, gating check per question: `q-open`, `q-point`. Write its pass condition for this piece, naming the audience from `BRIEF.md` ("a developer who has never heard of the product"). `read` becomes two checks: `q-read-time` (scripted, below) and `q-read` (judged: size and contrast).
- Every verdict cites the capture path and the timestamp it judged, and what the viewer sees and hears there. A verdict without them is returned to the critic, as wow-loop does with any gating finding that lacks evidence.
- Severity uses wow-loop's anchors verbatim. For these questions "normal use" means one natural playback by the `BRIEF.md` audience. A failed decisive question, or a failed `q-point`, is a blocker.
- `q-point` stays blind. Its pass condition never states the intended belief: write it as "a judge finds the critic's sentence states the same belief as the `BRIEF.md` feeling-and-job line". A separate fresh critic answers it with only the artifact, the capture instructions and the audience: no `BRIEF.md`, `spec.md`, `bar.md` or kickoff brief. Its sentence goes in the finding's measurement. A second fresh agent, given only that sentence and the feeling-and-job line, returns same or different, and that is the check's status. The orchestrator never makes this call.
- `open` on a vertical or feed piece is judged twice, with sound and muted, at phone size. Feeds autoplay muted.
- `own`: the critic reviews frame strips with the subject's name and logo covered and names what else the piece could be for. A plausible rival or a whole category fails it.
- No agent can hear audio. `sound`, and the with-sound half of `open`, are decided by the measured checks in [sound.md](sound.md) plus the owner's listen, never by a critic's verdict.

## Scripted reading time

`q-read-time` runs in `check.sh` before critics are dispatched. It walks the engine's caption records (see [web-engine.md](web-engine.md)) and measures each caption's fully visible time, never `b - a`, which counts the entrance and exit too.

- Map `a` and `b` (start and end) through the piece's chapter mapping `L()` first: records are in default chapter seconds. The stagger and fade constants below are real seconds and do not scale.
- Fully visible starts when the last word has finished arriving and ends when the fade-out starts. In the engine skeleton a statement's last word arrives at `a + (n - 1) * 0.07 + 0.7`, where `n` is the number of word spans the engine makes (punctuation after a tag is its own span); other captions are in at `a + 0.7`; the fade-out starts at `b - 0.45`. The whole caption layer also fades in over the first 0.8 s and out over the last 0.7 s of the piece, so clamp to that window. Read the piece's own constants if they differ.
- Fail any caption whose fully visible time is under 0.25 s per real word of its text plus 1 s (the budget in [story.md](story.md)). Example: a ten-word statement with `b - a` = 3.5 s mid-piece is fully visible for 1.72 s against a 3.5 s budget, so it fails.
- Fail the check when it finds no caption records; an empty walk is not a pass. A piece not built on that engine gets no `q-read-time`: `q-read` judges timing too.
- The skeleton's sample captions are placeholders and fail this check; retime them for a real piece.

## Protect the strongest moment

Repairs that improve weak parts often flatten the best one, and no other check notices.

- In the first review round each critic also names the strongest moment: timestamp, capture path, and why it works. The orchestrator takes the moment both critics name, or the experience critic's pick when they differ.
- It then adds a contract amendment with a judged, gating check `q-best`: the moment is still at least as strong as its recorded capture. The moment's details go in `bar.md` under that amendment.
- Every repair brief lists the moment as off-limits, unless a gating check fails inside it or a fix for a whole-piece check needs it. Then the brief names the change, and `q-best` is judged again that round.
- Critics get `q-best` with the other open findings, after their own assessment.

## Source

Viewer questions chosen by piece type, one decisive question per type, and naming the strongest moment so polish leaves it alone come from raea's critique rubric (`sdk/guides/craft/rubric.md` in shinyobjectz/raea at `fb3f708`, FSL-1.1-ALv2; reviewed 2026-11-05), which follows the method of pbakaus/impeccable. The question ids and the decisive mapping match raea's; every question and rule here is written in our own words. Ours: the type table and examples, the blind `q-point` with a separate judge, the muted `open`, the scripted reading time, and the strongest moment as a gating `q-best` check that repair briefs must respect.
