# Draft: Project Logic & Documentation Audit

## Objective
Analyze project documentation, simulate 100+ E2E use cases, and identify functional/logical gaps.

## Initial Context Gathering
- Status: Searching for documentation files...
- Methodology: Logic simulation based on found specifications.

## Logic Gaps & Findings (In-Progress)

### 1. The "Starvation" of Backlog (Mixer Logic)
- **Problem**: The Mixer resurfaces only 3 random tasks per day from the backlog.
- **Simulation**: With a backlog of 300 tasks (common for "lazy" users), it takes 100 days to cycle through them once. 
- **Gap**: High-priority tasks might stay buried for months while trivial ones resurface. There's no "relevance" or "urgency" weighting in the random selection.

### 2. The "Sunset" Trap for Notes
- **Problem**: Notes (long-form content) bypass the Inbox and go straight to `active`. 
- **Simulation**: A user stores a long-term reference note (e.g., "Apartment Access Codes"). If they don't edit it for 30 days, the Sunset engine archives it.
- **Gap**: Reference material shouldn't "expire" based on interaction frequency the same way tasks do.

### 3. AI Misclassification Friction
- **Problem**: AI-assigned folders can only be changed in the "Details Sheet" after a task is moved from Inbox to Today.
- **Simulation**: AI incorrectly labels a work task as personal. The user swipes "To Plan". To fix the label, they must find it in the Today list, tap it, and change the chip.
- **Gap**: The Tinder-style UI lacks a quick-change folder action, forcing users to "accept" wrong data before fixing it.

### 4. Media "Black Hole"
- **Problem**: Links and files are auto-sorted into the "Media" folder.
- **Simulation**: A user sends 10 links to the bot. They go to Media. The Mixer and Sunset logic for Media is unclear or absent in the E2E flow.
- **Gap**: Media items often need the same "review/inhale" cycle as tasks, but currently, they just accumulate in a folder.

