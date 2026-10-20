# Architecture

> System flow, auth strategy, state management, cross-cutting structure. Keep it terse: pointers into code, not essays.

## DSH kill protection

`packages/dsh-command-guard`: at DSH start, `lib/protect.ps1` denies termination of DSH, its launcher chain and their console hosts; once verified, shell commands run unchecked, else `lib/policy.js` keeps the strict kill policy. `start-dsh.ps1` `Stop-Gracefully` releases before it stops DSH.

```mermaid
flowchart TD
  L[start-dsh.ps1 launcher] -->|spawns| C[cmd / npx node / cmd]
  C --> D[DSH host node]
  D -->|plugin start| G[dsh-command-guard]
  G -->|runs| P[protect.ps1]
  P -->|deny PROCESS_TERMINATE| D
  P -->|deny PROCESS_TERMINATE| C
  P -->|deny PROCESS_TERMINATE| L
  P -->|deny PROCESS_TERMINATE| H[conhost / OpenConsole]
  P -->|verified| A{protection active?}
  A -->|yes| U[shell.run / shell.start: any kill command runs]
  A -->|no or failed| S[strict kill policy: one literal PID]
  L -->|Stop / restart / upgrade: protect.ps1 -Release, then taskkill| D
```
