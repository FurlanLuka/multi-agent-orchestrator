# Day 3: the desktop app experiment

i woke up thinking "you know what would be cool? a real mac app."

not just a web ui that runs in the browser. a proper app in the dock. with an icon. that you can install via homebrew.

16 sessions later, i was questioning this decision.

---

## tauri time

tauri is like electron but rust-based and lighter. you wrap your web app in a native shell and boom - desktop app. at least that's what the docs promise.

reality: it works great until it doesn't.

my first problem was subtle. the app launched fine, the UI worked, but spawning claude cli from the app... failed silently. the orchestrator needs to run `claude` as a subprocess. works perfectly from terminal. doesn't work from the mac app.

why?

when you launch an app from finder (or dock), it doesn't get your shell environment. no `.zshrc`. no `.bashrc`. your PATH is basically `/usr/bin:/bin:/usr/sbin:/sbin`.

all the good stuff - homebrew, nvm, the claude cli itself - lives in paths that aren't available.

i spent hours trying to:
- manually construct PATH from known locations
- source the user's shell profile at runtime
- detect which shell they use and load its config

each solution was hackier than the last.

---

## mermaid diagrams were broken too

while fighting tauri, i noticed another bug:

> can you analyze what would generated mermaid diagrams why would cut off a lot of text? cant text adjust size or something?

the planning agent generates architecture diagrams in mermaid syntax. beautiful in theory - you get flowcharts showing how data moves between frontend and backend.

except the text was getting clipped. long labels just... stopped.

```
┌─────────────────┐     ┌─────────────────┐
│  AuthService    │────▶│  Create new use │  <- cut off
└─────────────────┘     └─────────────────┘
```

turns out mermaid's default SVG rendering doesn't handle long text gracefully. needed to:
- add text wrapping
- adjust node widths dynamically
- set reasonable max-widths with overflow handling

not rocket science, but another hour gone.

---

## the monorepo move

good news: i cleaned up the project structure.

everything was getting messy - backend code here, frontend code there, types duplicated, configs scattered. time for a proper monorepo.

new structure:
```
orchestrator/
├── orchestrator-backend/   # node backend
├── orchestrator-web/       # react frontend  
├── orchestrator-types/     # shared types (@orchy/types)
└── package.json            # workspace root
```

renamed everything to "AIO Orchestrator" (AIO = All-In-One). updated paths to use `~/.aio-config/` for user data.

this was satisfying. the codebase finally felt organized. small win on a frustrating day.

---

## dynamic ports

practical problem: what if someone wants to run two instances?

the orchestrator runs a web server on port 3456. if that port is taken, it crashes. not great.

> Enable running multiple AIO Orchestrator instances simultaneously by ensuring dynamic port allocation works correctly.

fix: try your preferred port, if taken increment and try again. tell the user which port you ended up on.

simple but important for a good UX. nobody wants "EADDRINUSE" errors.

---

## the flow system

biggest change today: redesigned how the chat shows events.

old way: everything dumps into a linear timeline. planning events, task events, E2E events, all interleaved and confusing.

new way: two sections.
- **bottom**: active operations with spinners, live updates
- **top**: completed events, immutable history

active stuff stays at the bottom so you can see what's happening now. when something completes, it floats up into history. the chat reads naturally top-to-bottom as a record of what happened.

also added "flow tracking" - related events are visually grouped. so "Task 1 started" → "Task 1 verifying" → "Task 1 complete" appear as a connected flow, not three separate random cards.

---

## the tauri verdict

by end of day, tauri was "working" but felt wrong.

every time i solved one environment issue, another appeared. the shell PATH thing was just the start. there were issues with:
- file permissions in sandboxed context
- notifications not working without entitlements
- code signing requirements for distribution

i started thinking: why am i fighting this?

the web UI works great. users can run `aio` from terminal, it opens localhost in their browser. simple, predictable, no native app complexity.

maybe a desktop app isn't the answer. maybe the answer is just... a good CLI.

that thought would become tomorrow's big decision.

---

## what i actually accomplished

- tauri setup (will probably remove it)
- monorepo structure (keeper)
- dynamic port allocation (keeper)
- mermaid diagram fixes (keeper)
- flow-based chat UI (keeper)

sometimes you spend a day going down the wrong path. the trick is recognizing it before you've gone too far.

---

*16 sessions. one existential crisis about distribution strategy. nice folder structure though.*
