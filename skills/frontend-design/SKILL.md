---
name: frontend-design
description: "Guidance for distinctive, intentional visual design when building a new UI or reshaping an existing one — aesthetic direction, typography, palette, layout, motion and interface copy that do not read as templated defaults. Use for frontend work whose look matters: landing and marketing pages, dashboard screens in an existing product, docs sites, or any page a person will judge by how it looks."
license: Apache-2.0 (LICENSE.txt) for the plugin body, MIT (LICENSE-cookbook.txt) for the cookbook rules.
metadata:
  sources: "anthropics/claude-plugins-official plugins/frontend-design (Apache-2.0); anthropics/claude-cookbooks coding/prompting_for_frontend_aesthetics.ipynb (MIT, Anthropic)"
---

# Frontend design

Approach this as the design lead at a design studio known for giving every client a distinct visual identity that is not mistaken for anyone else's. This client has already rejected proposals that felt cliché or templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take aesthetic risk if justified.

## When the product already has a design

The existing product design is a decision, not an oversight. It wins over any free choice this skill offers.

- A tool, a dashboard or an admin screen has its own theme: tokens, fonts, colors, spacing, radius. Find them and use them, together with the components that already exist. No new fonts, palettes, motion libraries or dependencies on such a screen, and no restyling of screens the brief did not name.
- A screen that must match an owner-supplied reference is copied, not reinterpreted: build it, screenshot it at the reference's viewport, compare against the source image, record the differences and what changed in `design-qa.md`, and keep the comparison honest about what was not captured.
- Bold aesthetic direction belongs to the marketing site and the docs, not to the tool. There the product identity is the starting point, not a ceiling — but a visitor must still recognize it as the same product.
- Product copy speaks in the words its users use: fields, records, balances, players, environments. Never the names of the internal design — that is a contract with users, not a style preference.

## Ground your designs in the subject matter

If the brief does not identify what the product or subject matter is, identify it yourself before designing, and confirm with the owner. You can come up with one concrete subject, the design's audience, and the design's primary job, as a proposal. If there's any information in your memory about the owner's preferences or context about what they're building, use that as a hint. The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from — a design for a toy for girls aged 8–11 will be very aesthetically different from a dashboard for financial analysts. Build with the brief's real content and subject matter throughout.

## Design principles

For web designs, the hero is the first thing viewers will see. Open with the most characteristic thing in the subject's world, in the form that is most appropriate: a headline, an image, an animation, a live demo, an interactive moment, or other treatments. Be deliberate with your choice: a big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option.

Typography carries the personality of the page. You don't need a different typeface for display or headline text and body content: use one family or two, and if two, make them clearly distinct.

Choose your typefaces deliberately, not the default families you would reach for on any other project, and set a clear type scale following the default guidance of The Elements of Typographic Style with intentional weights, widths, and spacing. When type is used as a headline or visual element, use the type treatment itself as an active part of the design, not a neutral delivery vehicle for the content.

Where the typeface is actually free, the pools worth drawing from: editorial (Fraunces, Newsreader, Crimson Pro, Playfair Display), technical (IBM Plex family, Source Sans 3), startup (Clash Display, Satoshi, Cabinet Grotesk), distinctive (Bricolage Grotesque, Obviously), monospace (JetBrains Mono, Fira Code). Never Inter, Roboto, Open Sans, Lato or the system stack as the carrier of personality. Contrast is what makes a pairing interesting: display with monospace, serif with geometric sans, one variable face across disparate weights. Use extremes — 100/200 against 800/900 rather than 400 against 600, and scale jumps of three times or more rather than one and a half.

Space Grotesk and JetBrains Mono are now as common a reach as the faces above once were. In our own product they are the established identity and stay; in a new brief, picking either is the default, not a choice.

Default to line lengths of less than 80 characters. Serif typefaces can have slightly longer line lengths; give serif body text slightly more line-height than a sans-serif.

Commit to color. Describe the base palette as four to six named values, pick a dominant one and one sharp accent, and carry it through CSS variables instead of rewriting values per component. Timid, evenly distributed palettes read as unfinished; a purple gradient on white is the single most recognizable generated look.

Give the page atmosphere instead of a flat fill: layered gradients, a geometric pattern, or a texture that belongs to the subject — never a decorative wash behind content that has nothing to do with it.

Avoid these default typographic treatments; they are the commonest tells of a generated page:
- Accenting just a single word or phrase in a headline, like putting one word in italic/bold or a different color.
- Using all caps for labels.
- Adding unnecessary typographic labels above content.

Visual structure is information. Structural devices like outlines, borders, numbering, eyebrows, dividers, labels, etc., encode useful information about the content rather than decorate it. Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence — like a stepped process or a timeline. Before adding numbered markers, check the content really is a sequence.

Use non-user-triggered motion sparingly and deliberately, only to draw attention. A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated. Stagger a reveal with `animation-delay` rather than adding an effect per element. Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed. Prefer CSS; reach for a motion library only when it is already a dependency of the project.

Consider written content carefully. Often a design brief may not contain real content, and it's up to you to come up with copy and placeholder content. Copy can make a design feel as templated as the design itself. See the below section on writing for more guidance.

## Process: plan, review against the brief, build, critique

For calibration, AI-generated design right now clusters around some traits:
1. a warm cream background (near #F4F1EA) with a high-contrast serif display and a terracotta or warm-clay accent (often near #D97757 — Anthropic's own Claude-interaction accent, so on a user's brief it reads as a tell);
2. a near-black background with a single bright acid-green or vermilion accent;
3. a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns;
4. the SaaS-card kit: content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy, the same soft grey shadow (rgba(0,0,0,.1)) under each, and gradient washes as decoration;
5. template chrome that appears whatever the subject: a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots ('A · B · C'); labels built as 'WORD — fragment' with a spaced em dash; tinted near-black (#0B0B0B, #111) standing in for black; a monospace face for small data labels; a '→' appended to link and button text.

All traits are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. As with a hired human designer, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.

Work in two passes. First, brainstorm a short design plan based on the brief: create a compact token system with color, type, layout, and principles.
- Color: describe the core base palette as 4–6 named hex values, name the dominant one and the accent.
- Type: the typefaces and their roles, and the weight and size extremes you will use.
- Layout: a layout concept, using one-sentence prose descriptions and ASCII wireframes to ideate and compare. Include alignment guidance; should the content be left aligned, center aligned, justified?
- Principles: the high-level guidance for what makes this page unique.

Then review that plan against the brief before building: if any part of it reads like the generic default you would produce for any similar page (work through a similar prompt to see if you arrive somewhere similar) rather than a choice made for this specific brief — revise that part, say what you changed and why. Only after you've confirmed the relative uniqueness of your design plan should you start to write the code, following the revised plan.

Work on one dimension at a time when one is the problem. Asked to fix typography, change typography and leave the palette alone; asked for a different feel through color, keep the layout. State which dimension you are changing and why before you change it.

When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and an element-based selector like .cta). This can happen often with padding/margin between sections.

## Restraint and self-critique

Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes. Critique your own work as you build, taking screenshots to review if your environment supports it — a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory. Human creatives have memory and always try to do something new, so if you have a space to quickly jot down notes about what you've tried, it can help you in future passes.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand and use. They are design content, not decoration. Bring the same intentionality and minimalism to copywriting that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.

Write from the end user's perspective. Name things by what users will understand in simple language, not by how the system is built. A user manages notifications, not webhook config. Describe what something is or does in plain terms rather than selling it. Being specific and legible to new users is always better than being clever.

Use active voice as default. A CTA says exactly what happens when it is used: "Save changes," not "Submit." An action keeps the same name through the whole flow, so the button that says "Publish" produces a toast that says "Published." The vocabulary of an interface is the signposting for someone navigating the product. Cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.

Keep the tone conversational: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each written element do exactly one job.
