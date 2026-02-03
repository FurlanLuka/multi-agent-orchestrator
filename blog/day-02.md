# Day 2: everything broke (25 times)

25 sessions. twenty five. that's how many separate conversations i had with claude today trying to fix, improve, and not lose my mind.

this was the day the orchestrator went from "cool prototype" to "something that might actually be usable". it was also the day i learned that every fix creates two new bugs.

---

## the git problem

i wanted this tool to feel like a real development workflow. and real development has git. so:

> okay i want to add gitops. so when you add project you can specify if you want git usage or not. if you do you should specify also main branch. then when you setup task... we should be able to also add input fields for branch name.

the vision:
- create feature branch automatically
- commit after each completed task  
- option to merge when everything passes

sounds reasonable right?

implementing it was a nightmare of edge cases:
- what if the repo doesn't have git init yet?
- what if the branch already exists?
- what if the commit fails because nothing changed?
- what if merge conflicts?

each of these broke something. fixed one, another appeared.

> actually once we push branch add ability to merge into main branch. if it fails due to conflicts or anything just show error nothing else

that last part - "just show error nothing else" - was me giving up on handling every edge case gracefully. sometimes you just gotta let it fail.

---

## the json parsing disaster

here's a fun bug that ate hours of my life.

agents communicate back to the orchestrator via JSON. simple right? except claude likes to wrap JSON in markdown code blocks. so instead of:
```json
{"status": "complete", "result": "..."}
```

you get:
```
Here's the result:

\`\`\`json
{"status": "complete", "result": "..."}
\`\`\`

Let me know if you need anything else!
```

my json parser: 💀

i had built this increasingly insane tower of fallbacks:
1. try direct JSON.parse
2. try extracting from markdown code blocks
3. try regex for json-like patterns
4. try counting braces and extracting
5. give up and treat as failure

four layers of fallback regex. FOUR. this is not how software should work.

the fix was obvious in hindsight: markers.

```
[RESULT_START]
{"status": "complete", "result": "..."}
[RESULT_END]
```

tell the agent to wrap its output in clear delimiters. no ambiguity. no parsing gymnastics.

why didn't i do this from day one? because i was optimistic. i thought "claude is smart, it'll give me clean json". narrator: it did not.

---

## the E2E race condition (again)

remember yesterday's race condition? it came back with friends.

> another bug with e2e -> so one test failed -> instructed fix -> afterwards it marked tasks done for backend which triggered front-end tests even though we want all dependant (be) e2e tests to be finished first

the problem: project dependencies weren't being respected during the E2E phase. backend needs to fully complete (including its own E2E tests) before frontend E2E starts.

the state machine looked like:
```
PENDING → WORKING → IDLE
```

but it needed to be:
```
PENDING → WORKING → VERIFYING → E2E_TESTING → IDLE
```

more states = more places for bugs = more fun debugging at 11pm.

---

## the UI mess

while everything was breaking, i also had opinions about the chat interface:

> wait on planning agent chat why do i suddenly see Processing: tool_start (twbe)? and they look as they are waiting? but those arent run on the actual planning agent right?

the chat was showing internal events that users shouldn't see. every tool call from every sub-agent was bubbling up as a "processing" card. i had like 95 of them stacked up, all saying "waiting" even though things were completing.

the fix: two-section chat layout.
- bottom: in-progress operations (mutable, can update)
- top: completed operations (immutable history)

in-progress stuff at the bottom means new items push old ones up into history naturally. no more 95 "waiting" cards.

---

## dependency checking

added something practical:

> also when i load page i want to have splash page which check if user has access to claude cli and git cli because these are required to work. if not it shows error and tells user how to install.

because nothing is more frustrating than getting deep into setup only to discover you're missing a dependency. check upfront, fail fast.

---

## the branch name bug

this one was embarrassing:

> also i selected branch feature/twitter but it created branch name based on task i think? make sure that input that we do for branch when making feature is actually the branch thats added

i had a UI input for branch name. user types "feature/twitter". agent creates "feature/add-authentication-to-blog-post-creation".

the input was being ignored entirely. the branch name was being auto-generated from the task description.

classic case of building a feature, forgetting to wire it up, and wondering why users are "doing it wrong".

---

## end of day 2

what got built:
- gitops (branches, commits, merge)
- dependency checker splash screen
- marker-based json communication
- two-section chat layout
- fixed about 47 race conditions (approximately)

what's still broken:
- probably things i haven't discovered yet

the codebase is starting to feel real though. like something you could actually use to build apps, not just a tech demo.

tomorrow: apparently i'm going to try making this a desktop app? past me made some choices.

---

*25 sessions. marker-based communication. git integration. still standing.*
