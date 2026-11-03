# Live-local check

Part of Step 4 of the loop, and only when the user opted in with `live-local`. This part is ours; upstream has no counterpart.

Some candidates end Step 4 as `needs_validation` because the deciding fact is runtime behavior: what a page renders, whether a request is refused, what the app stores. Source reading and single-function harnesses cannot show it. This step runs the owner's app once on loopback with dummy data and checks those candidates through the app's normal interface. It is the owner-local tier from SKILL.md applied to the whole app, with the same limits: rule 6 holds in full, and nothing here reaches a deployed or shared system.

## When it runs

All of these must hold:

- the user asked for `live-local` in this run;
- the app's paths are owner-local as SKILL.md defines them;
- at least one candidate, usually a `needs_validation` record from Step 4, has a blocker that the running app could settle, and its class is one of injection, cross-site scripting, server-side request forgery, authentication, or authorization.

A candidate's class comes from the `attack_class` block reference of its linked units:

- injection: `ATTACK-CLASSES.md#Injection` and `local-classes.md#XML parser that resolves external entities`, except sinks that render HTML in a browser;
- cross-site scripting: `CLIENT-SIDE.md#DOM-based XSS`, and `ATTACK-CLASSES.md#Injection` when the sink is HTML or a template rendered in a browser;
- server-side request forgery: `ATTACK-CLASSES.md#Resource and file handling` and `local-classes.md#URL fetcher with no scheme allowlist` when the sink is a request the app sends, and `ATTACK-CLASSES.md#Feature abuse and data leakage` when the app fetches a notification, webhook, or callback URL;
- authentication: every block in the browser-session, federated-identity, and MFA, passkey, and account-transition sections of `WEB-PROTOCOL-AND-AUTH.md`, plus `local-classes.md#One-time code with no attempt limit` and `local-classes.md#Refresh token without rotation or binding`;
- authorization: `ATTACK-CLASSES.md#Access control`, every block in the tenant and object-isolation section of `DATA-ISOLATION-AND-LIFECYCLE.md`, `WEB-PROTOCOL-AND-AUTH.md#API-key scope and resource binding`, `local-classes.md#GraphQL field resolver without the parent's authorization`, and `local-classes.md#Opaque cursor or global ID trusted as authorization`.

Any other reference is outside the five classes.

Skip the step when any of these holds. Every candidate then keeps its Step 4 verdict.

- The paths are source-only. Source-only code never runs under this step.
- The repository has no lockfile, so the exec tree has no dependencies (Layout in SKILL.md).
- The app needs a service that cannot run on loopback and has no local mock or stub: a managed database with no local equivalent, or a third-party identity provider with no stub, for example.
- There is no way to seed a datastore with dummy principals.
- The app does not answer on loopback within the start time limit.
- The user budget cannot cover the agents under Cost.

When the exec tree has no `playwright` or `playwright-core`, the browser cannot start, and SKILL.md forbids installs: checks that need a browser do not run, and their candidates keep their Step 4 verdict. Checks that need only HTTP requests may still run, and the mapping agent then maps over HTTP only (Mapping agent).

Record every skip and its reason for the report.

## Bringing the app up

The parent starts the app once per run, in the exec tree, before any agent launches. Checking agents never start, restart, or reconfigure it.

1. Create an agent root for the app, for example `<output>/agents/live-local-app/`, and use its `scratch/` as the home, temp, and data folder for every process below.
2. Pick free loopback ports for the app, its local datastore, and a callback listener. Bind every process to `127.0.0.1` or `localhost`, never to all interfaces.
3. Start each process from the empty-environment template in SKILL.md. Replace `timeout 120` with a start time limit: the parent starts the command as a background shell job (a trailing `&`, output redirected to the log) or through its shell tool's background option, then polls its loopback port until it answers or the limit passes (about 120 seconds). Use the repository's own start command and choose the one closest to a normal build that still runs on loopback. In place of the template's `NODE_ENV=test CI=1`, set the mode closest to a normal production build that the app allows (for example `NODE_ENV=production`, with `CI` unset), because many stacks turn off CSRF, rate limits, or auth checks in test mode. Record the `NODE_ENV` and `CI` values used in `run-metadata.json`. As soon as the parent starts a process, before it polls, it appends one line to `<output>/processes.log` with the process name, a pid it can stop, the loopback port the process should bind, the origin a client uses to reach it (for example `http://127.0.0.1:4300`), and the full command. In Git Bash `$!` is an MSYS wrapper pid, so the parent records the Windows pid from `/proc/$!/winpid`, which it reads right after the start; elsewhere it records `$!`. When the port answers, the parent adds to the same line the listening pid from the port lookup in item 8 and that process's command line. When a port does not answer within the limit, or a start or seed command fails, the parent runs the teardown in item 8 and records the skip.
4. Pass only named variables with dummy values: the ports, the datastore URL on loopback, dummy signing keys, the local URLs of mocks, and the app's telemetry-off variables where they exist (for example `NEXT_TELEMETRY_DISABLED=1`). List each name and dummy value in `run-metadata.json`. Never copy the ambient environment or any `.env` file.
5. Point every outbound call to a real service (mail, payments, storage, identity, model providers) at a local mock or stub on loopback. Prefer the repository's own test mocks. A call that cannot be redirected is a skip condition for every candidate whose path reaches it. A call the app makes at startup (telemetry, OIDC discovery, error reporting) leaves the machine before any check runs, so one the parent cannot point at a local mock skips the whole step.
6. Run a small listener on the callback port that logs every inbound request (method, path, headers, time) to the app root's scratch. It lets a check observe a server-side request made by the app without that request leaving the machine.
7. Seed the datastore with the repository's own seed or migration command, or a small fixture written into the app root's scratch. Seed at least two dummy accounts per role, so every cross-account and cross-role check has a separate actor and victim, plus spare accounts for the re-verifiers (Verdicts). Use obviously fake names, emails, and passwords.
8. Keep the app up until every re-verifier for this step (Verdicts) has finished. The parent runs this teardown on every exit from the step after it starts the first process: a start timeout, a failed start or seed command, a skip condition it finds after startup, and the normal end. In Git Bash child node processes survive `kill` of the job, so teardown stops whole process trees. For each line in `processes.log`, the parent:
   - finds the listener with the port lookup, which selects only a LISTENING row whose local address is exactly `127.0.0.1:<port>` or `[::1]:<port>`: on Windows `netstat -ano | tr -d '\r' | awk -v p=<port> '$1 == "TCP" && $4 == "LISTENING" && ($2 == "127.0.0.1:" p || $2 == "[::1]:" p) { print $5 }'`, elsewhere `lsof -nP -t -iTCP:<port> -sTCP:LISTEN`;
   - before it stops a listener, confirms that the listener belongs to this run: its pid equals the listening pid that the line holds, or its command line (`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>').CommandLine"` on Windows, `ps -o args= -p <pid>` elsewhere) matches the command line that the line holds. The parent never stops a listener that fails this check: it records that listener's pid, port, and command line in `run-metadata.json` and tells the user;
   - stops each confirmed listener's process tree (`taskkill //PID <pid> //T //F`, or `kill` on the process group);
   - when the process never bound its port (the line has no listening pid), stops the process tree by the pid the parent wrote at start, the same way.

   Then the parent confirms that each pid in `processes.log` is gone (`tasklist //FI "PID eq <pid>" //NH` lists no process with that pid on Windows; `kill -0 <pid>` fails elsewhere) and that the port lookup returns nothing for each port in `processes.log`. When a pid from `processes.log` still runs, the parent stops its tree by that pid and checks again.

No new installs. The exec tree's dependencies come only from the lockfile with install scripts disabled, as SKILL.md requires. Do not install Docker, Podman, a database server, or any other tool. A service the repository cannot run from its own installed dependencies is a skip condition.

Where a candidate reproduces only because of a development flag, a test-only route, a mock authentication provider, or a test or development mode in this local start, Step 6 reachability applies: the result does not confirm the record.

## Mapping agent

One fresh agent maps the running app before any check. It reports what it sees; it tests nothing.

- It drives the app in headed Chrome through `launchPlacedChrome({ place: 'offscreen' })` (`scripts/lib/launch-chrome.mjs`). The explicit `place` matters: the empty environment drops `CHROME_PLACE`, and without it the launcher puts Chrome on the user's other display. Where the repository lacks the launcher, it passes `--window-position=-2400,-2400`. It always passes `--mute-audio` and uses a fresh profile. The browser is never headless, because headless Chrome falls back to software rendering, and never minimized, because a minimized window throttles rendering to about one frame per second; either would make timing and rendering checks invalid.
- It opens only the origins in `processes.log`. It creates every browser context with `serviceWorkers: 'block'`, because the route handler does not see requests a service worker handles, and before the context's first navigation registers both `route` and `routeWebSocket` handlers. The handlers allow a request only when its origin (scheme, loopback host, and port) exactly matches the origin of a process the parent started for this step and wrote to `processes.log`: the app, its mocks, and the callback listener, with the `ws:` or `wss:` form of the same origin for WebSockets. They abort every other request, including requests to other ports on `127.0.0.1` or `localhost`. It lists the aborted URLs in its result.
- It signs in as each dummy role in turn and lists the pages, forms, and HTTP requests it sees. It submits no state-changing form or request, so the seed data reaches the checks unchanged.
- It ties each page, form, and request to the source route or handler in the audit tree, by file and line.
- When the exec tree has no `playwright` or `playwright-core` (When it runs), it maps without a browser. It reads the source routes and handlers in the audit tree and sends HTTP requests only to the app origin in `processes.log`, using only GET and HEAD. Where the app has an HTTP sign-in route, it signs in as each dummy role through that route, the one request it sends with another method. The other mapping rules still hold: it submits no state-changing request, ties each page and request to its source route or handler by file and line, and reports what it sees without testing.
- It writes the route map, the mode it used (`browser`, or `http` when it mapped without a browser), the aborted URLs, and the roles it could and could not sign in as into its `result.json`, under the result contract in SKILL.md (Briefs). The mode tells the checking agents that an `http` map leaves out behavior only a browser shows, such as client-side routes and requests that scripts build.

The first two items are the browser rules for every agent in this step that opens a browser: the mapping agent, the checking agents, and the re-verifiers. Each of them uses the same origin allowlist from `processes.log`, sends its own HTTP requests only to those origins, and lists the URLs its handlers aborted in its result; a checking agent names them in the `result` text of the check whose page had them.

Evidence screenshots go to the agent's scratch, and the parent promotes them like any other artifact (Checking agents). Only captures that are not evidence go where the user's instructions put them, else under `<output>/screenshots/`.

## Checking agents

One fresh agent per selected class that has candidates: injection, cross-site scripting, server-side request forgery, authentication, and authorization. Candidates in other classes keep their Step 4 verdict.

A checking agent's brief holds only: the candidates in its class with their linked units' checks and artifact paths, the route map, the dummy accounts it may use, the callback listener's port and log path, the rules from SKILL.md with the owner-local tier rules, the browser rules above, and the `confirmed`, `needs_validation`, and `rejected` branches of `scripts/report-schema.json` verbatim. Never another agent's conclusion.

Rule 3 holds: no checking agent hunted a candidate it checks or validated it in Step 4. The mapping agent checks nothing.

For each candidate, the agent:

1. reproduces the claimed path through the app's normal interface: a page, a form, or an HTTP request to the loopback app;
2. acts as one dummy account against another dummy account's data when the claim crosses accounts or roles, and never against its own data only;
3. puts a token unique to this check in its callback path and in any stored marker, and counts a callback, rendered value, or stored payload only when it carries that token, because parallel checks, the mapping crawl, and background jobs share one app, datastore, and callback log;
4. stops at the smallest observed wrong result: one unauthorized dummy record read or changed, one rendered value that should have been escaped, one request logged by the callback listener;
5. records the exact request or browser action, the dummy account used, and what the app returned, rendered, or stored;
6. when the page had aborted script or style requests, including any the origin allowlist aborted on another loopback port, confirms only after showing that those resources are not on the path to the result (an aborted sanitizer or CSP script can make the page render raw markup that production would not); otherwise it records `needs_validation`.

It never repeats a check to measure load and never sends traffic meant to slow or stop the app. If the app stops answering, the agent records that and stops; the parent decides whether to restart it.

Checking agents run in parallel against one app. Give each agent its own dummy accounts from the seed, or run the agents one after another when the seed has too few.

Evidence goes only to the agent's scratch, named as `agents/<agent id>/artifacts/<path>`. The parent promotes it with `promote-artifact.mjs` after the agent finishes, as for every other local check. A rejected file is not evidence. The script rejects files over 256 KiB, which rules out most full-page screenshots and HAR or trace files, so keep evidence small: a DOM excerpt, an HTTP transcript, or a cropped image. The parent adds each check in the entry's `checks` array (Verdicts) to the candidate's linked units as written: the agent's own `agent_id` and `reviewed_paths`, `method: "local"`, a `result` that starts with `[owner-local]`, and an `artifact` under `agents/<agent id>/artifacts/`.

## Verdicts

Each checking agent writes exactly one JSON object to `result.json`, under the result contract in SKILL.md (Briefs). The object holds a `candidates` array with one entry per assigned candidate. Each entry carries the candidate's fingerprint and is otherwise in the Step 4 verifier form, plus the checks the ledger needs: `{"candidates": [{"fingerprint": "...", "decision": "confirmed|needs_validation|rejected", "record": { ... }, "checks": [ ... ]}]}`, where `record` matches the decision's schema branch exactly. Each `checks` item has the hunting.md check shape with exactly the fields `agent_id`, `reviewed_paths`, `invariant`, `method: "local"`, `result`, and `artifact`, where `artifact` is the scratch-relative evidence file the parent promotes, named `agents/<agent id>/artifacts/<path>`. This envelope exists only in `result.json`: `findings.json`, `report-schema.json`, and the validators do not change. The step adds no verdict, field, schema change, or validator change.

- **Demonstrated** through the app's interface: proposed `confirmed`. `execution` describes only the bounded local check performed: the attacker's dummy account, the minimal input in `payloads`, the steps in `instructions`, and in `observed_result` only what the app returned, rendered, stored, or sent.
- **Refuted by the running app**: proposed `rejected`, with the control that refused the request named in `reason` (a middleware, a template escape, an ownership check the source reading missed). Before proposing `rejected`, the agent shows that the same request from an authorized dummy account succeeds, and cites the refusing control at `file:line` in the audit tree; a 404 from a missing seed record, a 403 from a missing CSRF token, or a 401 from local auth setup is not that control. Without both, and for any failed reproduction with no identified control, the candidate stays `needs_validation`.
- **Still blocked** by something loopback cannot show (a proxy rule, a provider policy, a deployment setting): stays `needs_validation`, with `blockers` narrowed to what remains and the local part of the plan removed when this step settled it.

The parent reads each result as in hunting.md (Parent consolidation). It validates each entry and maps it to exactly one assigned fingerprint. It rejects an entry that is malformed (including one whose `fingerprint` differs from `record.fingerprint` or whose `decision` differs from `record.verdict`) or whose fingerprint repeats another entry's or names a candidate the parent did not assign to that agent, and it treats an assigned candidate with no entry the same way. A candidate whose entry the parent rejects keeps its Step 4 verdict, or goes to a fresh checking agent if the budget allows. The parent never repairs or fills in an entry.

Every proposed change is a material replacement under verification.md Step 6. Each goes to a fresh verifier that did not hunt, validate, or check that candidate, before the record enters `findings.json`. The app is still up: the re-verifier's brief adds the route map, its own dummy accounts that no other agent in this step used, the browser rules above, and the callback listener's port and log path. Each re-verifier puts its own fresh token, distinct from the checking agent's, in its callback path and in any stored marker, and counts a callback, rendered value, or stored payload only when it carries that token. It reproduces the result itself through the running app: the `observed_result` of a proposed `confirmed`, or the refusal and the authorized request of a proposed `rejected`. When it cannot, the candidate keeps its Step 4 verdict. Without budget for that verifier, the candidate keeps its Step 4 verdict and the report says so.

## Cost

One mapping agent, up to one checking agent per selected class that has candidates, and one fresh re-verifier per proposed change. They count against a user budget like any other agents. Reserve them before launching; when the budget cannot cover them, skip the step and say so in the report.

## Report

`REPORT.md` item 1 gains one line: live-local ran, was skipped (with the reason), or was not requested; and, when it ran, how many records it moved to `confirmed`, to `rejected`, and kept as `needs_validation`.
