# Packaging and publication

Published September 25, 2026: [`ditherto@0.1.0`](https://www.npmjs.com/package/ditherto) is available on npm. The first release was published through an authenticated local session. The release workflow now targets `vexlin/ditherto` and `release.yml` through npm trusted publishing.

Version `0.2.0` packages the new algorithm collection, optional blue-noise entry point, and updated `vexlin` repository metadata. A successful release workflow and registry verification confirm publication; publishing the website alone does not update npm.

## What is ready

- ESM and CommonJS entries with matching TypeScript declarations: `ditherto`, `ditherto/browser`, `ditherto/dom`, `ditherto/node`, and optional `ditherto/blue-noise`.
- The `ditherto` CLI, MIT license, visual README and a restricted package file list.
- `prepack` rebuilds the distribution before packing. `npm pack` produces `ditherto-0.2.0.tgz`.
- Package verification covers exports, declarations, CLI behavior, browser dependency isolation and gzip budgets.
- Browser entries contain no native imports. Node decoding/PNG encoding uses the existing `@napi-rs/canvas` dependency and its platform binaries; tarball size does not include installed dependency size.
- The `Release package` workflow tests, builds and publishes when a stable GitHub release is published. Manual runs build an archive by default; publishing from a manual run requires selecting the matching version tag. Tagging alone does not publish.

## Try the archive as a consumer

```sh
npm ci
npm run typecheck
npm run lint
npm run test:ci
npm run test:package
npm pack
# In a separate project:
npm install /absolute/path/to/ditherto-0.2.0.tgz
npx ditherto input.jpg -o output.png --palette MONO_BLUE --json
```

Inspect the archive before publishing: `npm pack --dry-run`. It should contain only `dist/`, `package.json`, `README.md`, `ALGORITHMS.md` and `LICENSE`, not photos, tests, site assets or development scripts. README images use absolute GitHub URLs so the package stays small.

## Manual npm publication

The account owner needs an npm account with the package name available and an authenticated publishing session. [npm's first-publication guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/) covers account setup and two-factor authentication.

1. Review the package and choose the release version. Update both package files with `npm version <version> --no-git-tag-version` if changing it, then commit the release changes.
2. Authenticate interactively with `npm login`; keep credentials and one-time codes out of chat and repository files.
3. Run the checks above and publish deliberately with `npm publish --access public`. This is the actual public-release step. Each version can only be published once.
4. Verify `npm view ditherto version` and try `npx --yes ditherto@0.2.0 --help` from a separate directory (use the version actually released).
5. Update the publication status and release notes, then attach the published tarball to the matching GitHub release.

## Subsequent releases via GitHub

The trusted publisher must authorize GitHub user `vexlin`, repository `ditherto`, workflow `release.yml`, with no environment restriction. Direct `npm publish` is enabled. The workflow uses Node 24, npm 11.19.1 and `id-token: write`; no persistent npm token is required. [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

For each subsequent release:

1. Choose the next stable version and run `npm version <version> --no-git-tag-version` to update both package files. Commit and push the changes.
2. Create and publish a GitHub release with the matching tag, such as `v0.1.1`, at that commit. A draft release, prerelease, tag push or ordinary branch push does not publish to npm.
3. The `Release package` workflow checks that the tag and both package versions agree, runs type checking, lint, unit tests, package checks and all three browser engines, then packs the tested build.
4. It uploads the archive as a workflow artifact and publishes that same archive to npm through OIDC. npm automatically adds provenance for this public repository.
5. Check the workflow result and `npm view ditherto version`. Each npm version is immutable; bump the version for later releases.

For a package-only rehearsal, run **Actions → Release package → Run workflow**, leaving `publish` unchecked. This does not exercise npm's OIDC authentication or publish anything. To retry a failed publication manually, select the matching version tag and enable `publish` only if that version has not reached npm. A failed test stops publication; investigate failures before retrying.

The existing `v0.1.0` release predates this trigger and is already on npm. It will not be republished by adding the workflow. The `0.2.0` release exercises the new trusted publisher and ships the algorithm additions since `0.1.0`.

## Other distribution options

**Start with npm.** It fits the CLI, Node/native image adapter and browser bundler consumers in one package. Direct ESM browser files are also available in the Pages site's `dist/` directory; users can self-host the built files. Pages URLs track the latest deployment, so pin or self-host a release for reproducible production use.

[JSR](https://jsr.io/docs/introduction) is worth revisiting for a separate browser-focused entry if users ask for it. Its TypeScript/ESM distribution model would require separate packaging and compatibility testing; it adds work without replacing the Node CLI's npm path. Do not claim Deno/Bun/native-platform support until verified on those runtimes. A scoped npm name such as `@jcinis/ditherto` is a fallback only if that npm scope is owned and the unscoped name is unavailable; it would require updating install examples.

## GitHub Pages

`npm run build:site` creates `_site/` using relative links so it works at `/ditherto/`. The Pages workflow deploys `main` through GitHub Actions. The Arcana homepage and both playgrounds share the built browser bundles and a small, credited sample-photo corpus. The homepage uses the library's responsive binding with a shared worker to rerender original photographs at their display widths; it has no application framework. Run `npm run assets:site` when intentionally refreshing the lossless PNG pictures used for static documentation and social previews.

## Preparation checks

The preparation run passed 259 unit tests, package verification, and 96 tests across Chromium, Firefox and WebKit. A separate project installed the actual tarball and exercised its CLI, Node encoder and imports. The built site was also served under `/ditherto/` to check both workers, sample photos, navigation and resize rendering.

One earlier local WebKit run read a blank source image in the existing DOM refresh test. It did not recur in 20 targeted runs or the subsequent full suite. Its cause is not established; no speculative decoding change or automatic test retry was added. Keep this observation in view during Safari testing before the public npm launch.

The approved Arcana design is served at `/`, `/playground.html`, and `/algorithms.html` (`/responsive.html` redirects there). The algorithm comparison page provides all eleven treatments, shared family controls, local uploads, and a PNG inspector. Previous example URLs and local experiment bookmarks redirect to the new pages. The earlier design remains available at `/classic.html` and the `classic-` example pages. Tarot artwork is kept in the website only, outside the npm package.
