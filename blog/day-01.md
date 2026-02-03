# Day 1: does this thing even work?

so i've been building this multi-agent orchestrator for a few weeks now. the idea is simple - instead of having one AI agent work on your code, have multiple agents work on different parts simultaneously. frontend agent, backend agent, coordinated by a planning agent.

sounds cool in theory. but does it actually work?

today was the day to find out.

---

## the test

i needed a real feature to test, not some toy example. so i picked authentication for a blog app - the kind of thing that touches both frontend and backend:

- backend needs auth guards on protected routes
- frontend needs to hide buttons when logged out
- both need to talk to each other correctly

one prompt to the orchestrator:

> make all features except viewing require authentication

and then... we wait.

---

## watching it work (kind of)

the planning agent kicked in first. it read both codebases, understood the NestJS backend had an existing AuthGuard, saw the React frontend was using Mantine components. then it created a plan splitting the work between projects.

this part was actually magical. watching an AI analyze two codebases and create a coherent plan across them? that's what i built this for.

then the execution started and things got... interesting.

---

## the bugs, obviously

first issue: the backend agent finished and marked itself complete, which triggered the frontend agent to start its E2E tests. except the backend E2E tests hadn't run yet.

race condition. classic.

the frontend tests failed because they expected the backend to have certain behaviors that hadn't been verified. the whole point of having dependencies between projects is that you test the backend BEFORE testing the frontend against it.

spent a few hours untangling the state machine. turns out i had:
```
project completes tasks → marks IDLE → triggers dependent E2E
```

when it should have been:
```
project completes tasks → runs own E2E → marks IDLE → triggers dependent E2E
```

subtle but important.

---

## the other thing

while debugging, i got distracted (as one does) and asked:

> can you experiment with theme a bit? i want this tool super cool and modern

because if i'm gonna stare at this UI all day while debugging, it might as well look good. this was the seed of what would eventually become the whole glassmorphism design system. but that's a story for later days.

---

## did it work?

by end of day: yes, technically.

the auth feature got implemented. backend guards on POST/PATCH/DELETE routes. frontend hiding create/edit buttons when not logged in. E2E tests passing on both sides.

but i wouldn't call it "working" working. more like "held together with duct tape" working. the race conditions were fixed but felt fragile. error handling was basically console.log and pray. the UI was functional but ugly.

still - seeing two AI agents coordinate on the same feature across different codebases? that part was exactly what i imagined when i started this project.

tomorrow: make it not break.

---

## prompts that mattered

the main planning prompt was surprisingly simple:
```
Feature: make all features except viewing require authentication

Available projects:
- example_frontend: ~/Documents/example_frontend  
- example_backend: ~/Documents/example_backend
```

the planning agent did the rest - exploring both codebases, understanding the existing patterns, creating tasks that fit each project's style.

that's the whole point. you describe WHAT, the orchestrator figures out HOW.

---

*10 sessions. countless race conditions. one working feature.*
