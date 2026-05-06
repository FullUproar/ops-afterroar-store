# Manus Source — Editorial Critique

*This document records the Mimir engineering team's editorial pass on the Manus AI Tabletop Recommendation Profiler deliverables (May 2026), per explicit user direction granting full editorial authority.*

## What Manus delivered

Three artifacts:

1. **Research synthesis (24 pages):** "The Tabletop Recommendation Graph: A Multi-Dimensional Framework for Board Game and Player Similarity" — a literature review covering psychological, sociological, mechanical, experiential, and cultural dimensions. Well-grounded, well-cited.
2. **Algorithm design (4 pages):** "Tabletop Recommendation Profiler: Algorithm & Questionnaire Design" — 5-step deterministic algorithm + 21-dimension taxonomy + question bank structure.
3. **Question bank JSON (118 questions):** Algorithmically generated; covers the 21 dimensions across this-or-that, Likert, and multiple-choice formats.

## What we kept verbatim

- The 21-dimension taxonomy structure across 5 clusters (PSY, SOC, MEC, AES, CTX). Solid foundation. Editorial addition: 3 new dimensions (`EMO_TENSION`, `EMO_HUMOR`, `CTX_PLAYER_COUNT`) covering gaps in Manus's framework. Total: 24.
- The 5-step algorithm (vector init → sample → weighted update → normalize → cosine match). Sound design.
- Manus's question Q0001 through Q0005 (5 curated this-or-that scenarios). Well-designed, multi-signal questions.
- Manus's question Q0006 through Q0015 (10 Likert scales). Mostly retained with minor weight tuning.
- Manus's question Q0116 through Q0118 (3 multiple-choice contextual prompts). Excellent.

## What we cut

**Q0016–Q0065 (50 questions): "Which setting?" pair tournament.**

Manus's bank includes 50 questions of the form "Which setting would you rather play in?" with the same 5 settings (intergalactic war / abstract shapes / farming village / cyberpunk / Marvel) shuffled in random pair orders. With 5 options, there are only C(5,2)=10 unique pairings; the 50 questions are 10 unique pairings repeated.

**Editorial action:** Kept ONE canonical question per unique pair. 50 → 10. Same dimensional coverage; 80% size reduction; eliminates fatigue from re-answering the same comparison.

**Q0066–Q0115 (50 questions): "Which core action?" pair tournament.**

Same issue. 5 fixed options (drafting / betraying / dice / spreadsheet / cooperating-against-AI) shuffled in random pair orders. 50 questions are 10 unique pairings.

**Editorial action:** Kept ONE canonical question per unique pair. 50 → 10.

**Net cut: 80 redundant questions removed.** Bank goes from 118 → 38 from Manus.

## What we added

**12 new questions** to address gaps:

1. **5 game-vs-game forced choices** using games from the seed pool (Sprint 1.0.1). Examples: "Twilight Imperium vs Codenames" extracts MEC_COMPLEXITY + CTX_TIME + PSY_KILLER + PSY_EXTRAVERSION simultaneously. Game-vs-game is the most signal-dense format and Manus's bank had none.
2. **2 emotion-preference questions** mapping to EMO_TENSION and EMO_HUMOR.
3. **2 cognitive-comfort questions** that overlap with MEC_COMPLEXITY but specifically capture the *moment-to-moment* preference ("What's your headspace tonight?") that Manus's bank treats as static.
4. **2 context-preference questions** capturing CTX_PLAYER_COUNT and party-vs-hobby orientation.
5. **1 group-dynamics question** about alpha-player tolerance — a real-world social factor Manus's bank touched indirectly via Q0002 but didn't pin down.

**Total bank size: 50 questions.**

## What we tuned

### Weight adjustments

- **Q0006** ("I play games primarily to hang out with friends; the game itself doesn't matter much"): Manus assigned `MEC_COMPLEXITY: -0.5` to "strongly agree." The inference is a stretch — someone who plays for socializing might still enjoy complex games occasionally. Removed the MEC_COMPLEXITY weight. Kept PSY_SOCIAL.
- **Q0011** ("I get genuinely upset when I lose a game"): Manus has `PSY_ACHIEVEMENT` weight on "strongly agree" interpretation. Kept but weakened to 0.25. The relationship between getting upset losing and achievement motivation is real but not strong; could equally indicate high neuroticism alone.
- **Several settings/actions tournament questions**: Some weight assignments were inconsistent (e.g., "a peaceful farming village" got the same weight regardless of which game it was paired against). These are kept but flagged for revisit if the questionnaire ships and we get analysis.

## What's missing from Manus's algorithm (the load-bearing gap)

**Game profiling.** The algorithm matches user vectors to game vectors via cosine similarity but says nothing about how games get their 24-dimension vectors. Without game profiles, the algorithm can't actually produce recommendations.

**Editorial action:** Wrote `docs/game-profiling-strategy.md` specifying our approach — LLM-generated profiles for top ~500 games, validated against ~20 hand-curated reference games, refined via play data over time. This is a significant addition to what Manus delivered.

## What's elegant in Manus's design

Giving credit where due:

- The dimension space is well-thought-out and theoretically grounded. The 5-cluster organization (PSY/SOC/MEC/AES/CTX) is clean and useful.
- The deterministic algorithm is the right v0 choice. Doesn't reach for ML when it isn't needed.
- The confidence-based normalization (`max(1.0, C_user[d])` divisor) cleanly handles uneven coverage across dimensions.
- The cluster-coverage sampling rule ("every cluster hit ≥2 times") is a smart way to ensure the questionnaire stays useful even when shortened.
- Multi-format questions (this-or-that / Likert / multiple-choice) cover different elicitation styles — some preferences are easier to extract through forced choice, some through scaled agreement.
- The first ~15 curated questions (Q0001–Q0015) are genuinely well-written. Q0001 ("You have one hour of free time. Do you: read the rulebook for a heavy strategy game / play three quick rounds of a loud party game") is a great example of a multi-signal question — simultaneously tests PSY_CONSCIENTIOUSNESS, MEC_COMPLEXITY, CTX_TIME, PSY_EXTRAVERSION, and PSY_SOCIAL.

## What we'd suggest for a v2 from Manus

If Manus produces a follow-up:

1. **Drop the tournament-style filler.** It bloats the bank without adding signal.
2. **Add game-vs-game questions.** Highest signal-to-effort ratio.
3. **Specify game profiling.** Don't leave the load-bearing piece undefined.
4. **Cover emotion + cognitive load explicitly.** OCEAN proxies don't fully capture them.
5. **Calibrate weights empirically once data exists.** Manus's weights are reasonable starting heuristics; better weights emerge from analyzing how questions correlate with actual game preferences in real users.
6. **Multi-purpose questions are gold; explicit-axis questions are flat.** Manus's best questions hit 3+ dimensions simultaneously; the worst hit 1–2. Aim for the former.

## Conclusion

Manus's deliverable is a strong starting point. The framework is sound; the algorithm is correct; ~30% of the bank is genuinely high-quality. The other ~70% is filler we cut and replaced with higher-signal content.

The load-bearing missing piece (game profiling) gets specified by us in a separate doc. The end product — 50 questions, 24 dimensions, deterministic algorithm + LLM-generated game profiles — is what we'd call the seidr v1.0 launch package.

If Manus reads this critique: thank you for the foundation. Editorial authority used in good faith.
