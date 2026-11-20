# Clickable prototype (claude.ai artifact)

`plan-prototype.html` is a single-file mock of the Plan flow, published as a claude.ai artifact for hands-on
testing: https://claude.ai/artifact/KKEuqJrQm1YXmsK2XKkSrm

- **Availability is simulated.** A deterministic mock verifier runs in the page, and no real sites are contacted.
- **Shared mode:** when the viewer is signed in to claude.ai and can write the artifact's shared data (the owner,
  editors, or Contributors on Team plans), plans, RSVPs and votes are live across everyone's devices.
- **Solo mode:** for everyone else, everything stays in that browser. "Add a demo friend" simulates the group.
- **Testing tools** on each plan: add demo friends, age the checks by 20 minutes (shows "older check"), preview as a
  friend, and delete.

It mirrors the real app's rules: a check is not a hold, only the organiser chooses, and "booked" requires a venue
reference.
