# Introducing ditherto

Research checked September 25, 2026. These are recommendations and draft copy, not submitted posts. Community rules and submission routes can change; check them again immediately before posting.

## Positioning

Lead with a visual result and a working demo: **a small dithering library for coherent image styling, with per-image tuning and a scriptable CLI.** Agent compatibility is a useful workflow, not the entire identity. The concrete benefit is that the same settings can move from an interactive preview into code or a command. Avoid unsupported “fastest,” “best,” or image-quality claims.

## Where to share, in priority order

| Channel | Why it fits (our assessment) | What to bring |
| --- | --- | --- |
| [Show HN](https://news.ycombinator.com/showhn.html) | Good first technical launch once a stranger can try it immediately. Its guidelines call for personally built, usable projects with low barriers. | Link directly to the image playground, not just the marketing homepage. Explain the site-styling goal, original-image rerendering, and design tradeoffs. Be available to answer questions; don't solicit upvotes. |
| [DEV Community](https://dev.to/help) | A tutorial can reach people searching for practical JavaScript image-processing examples. | A short walkthrough: fixed palette → per-photo exposure → responsive page → matching CLI command. Use original pictures and a runnable example, with JavaScript/webdev/opensource tags as relevant. |
| [JavaScript Weekly](https://javascriptweekly.com/) | The newsletter explicitly covers JavaScript projects; a small browser/Node tool with live examples is a plausible editorial fit. | After the npm release, send a concise link suggestion through the publisher's current contact route. Include the npm link, live demo, repository and one sentence about what is distinctive. Selection is editorial, not guaranteed. |
| [r/javascript](https://www.reddit.com/r/javascript/about/rules.json) | Useful developer feedback if the author already participates. | Share source alongside the demo. Current rules permit self-promotion but say it must not be most of your contributions, and require code with demos. Use a technical explanation rather than a drive-by announcement. |
| [Processing Community Forum](https://discourse.processing.org/) | Its active Gallery and p5.js discussions make it a plausible later creative-coding audience. | First build a small p5.js/canvas example and contribute something directly relevant. Ask about aesthetic workflows and missing controls; don't claim a dedicated p5 integration already exists. |

Start with a few personal contacts or existing followers who actually make websites, then one public launch and one tutorial. Use feedback to improve the examples before approaching a newsletter. Product Hunt and broad “AI tools” directories are lower priority for a developer library at this stage; this ranking is our judgment, not a reach forecast.

## Suggested Show HN submission

Title: **Show HN: Ditherto – fixed-palette dithering for websites and the CLI**

URL: `https://jcinis.github.io/ditherto/examples/browser-demo.html`

Draft first comment:

> I wanted a way to give a whole site a consistent image style without forcing every photo to use the same exposure and contrast. Ditherto lets you share a palette and algorithm, tune each image, and rerender from the original when the layout changes.
>
> It has nine core algorithms—including Atkinson, Floyd–Steinberg, Bayer, Knoll, Sierra Lite, Stucki, halftone, Riemersma, and nearest-color mapping—plus two optional blue-noise variants, photo-derived palettes with a chosen color count, and a CLI that can export PNGs with JSON results. The playground runs locally in a worker and exports the settings as JavaScript or a CLI command. I use that render–inspect–adjust loop with both people and coding agents.
>
> The library is MIT licensed. I'd especially like feedback on the responsive API and which controls help you get a good result on difficult photographs.

Use this as an author-reviewed draft. If discussing how it was built, describe the older implementation, hand coding and agent-assisted audit candidly; do not imply the author personally wrote every line unaided.

## Tutorial outline

Working title: **A shared palette, a different exposure: dithering images across a website**

1. Show the same three photos with one palette and different tuning.
2. Introduce a minimal `observeDitherDOM` example with no manual dimensions.
3. Demonstrate resize rerendering and cleanup.
4. Extract eight colors from a reference photo, then reuse that palette.
5. Copy a CLI recipe; generate three exposure candidates and inspect the output.
6. Explain limits: fixed-palette RGB matching, caller-chosen settings, PNG-only CLI, wrapper-width browser layout, default main-thread library processing versus the worker-backed demos.

## Before posting

Confirm the public site and both playgrounds work on desktop/mobile; complete the first npm publication and test the exact install command from a fresh directory. Remove preview notices once that is true. Use the credited sample photos or your own images. Set a small feedback goal—such as three real integrations or five useful issue reports—and prioritize fixing those experiences over traffic counts.
