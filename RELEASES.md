# Releases

Published to npm as [`@shuttleglobal/twilio-demo-app`](https://www.npmjs.com/package/@shuttleglobal/twilio-demo-app).

This repository is mirrored: `origin` is GitHub (the public home), `bitbucket` is the publish
remote. There is no `verified` branch here - unlike the rest of the estate, nothing gates on one,
so pushing to Bitbucket `master` is itself the release action.

    git push bitbucket main:master

That runs `npm publish` and pushes to the public registry, so treat it as deliberate. Bump
`version` in `package.json` in the same commit as the change, otherwise the publish fails on a
duplicate version.

## 1.0.23 - 2026-07-29

- Pass the ACH account type to the Pay Connector as a `<Parameter>`. Twilio's `<Pay bankAccountType>`
  attribute drives its own IVR prompting and is echoed back on the action webhook, but it is not
  forwarded when Twilio creates the charge. ACH charges therefore reached Shuttle with no account
  type and were rejected with "Validation error" (Twilio `PayErrorCode` 64008, "Payment Gateway
  rejected charge creation"). The demo menu options now map to the values the gateway integrations
  expect: `checking`, `savings` and `businessChecking`.
- Raised the Node engine requirement to `>=20`, matching the `node:20` build image.
- Refreshed dependencies for `npm audit` (axios, body-parser, form-data advisories). All resolved
  within the existing semver ranges, so `package.json` was unchanged.
- Added `bitbucket-pipelines.yml` to publish from `master`.

## 1.0.22 - 2026-06-10

- Security updates (`npm audit`) and cleanup.

## 1.0.18 - 2024-07-04

- Typo fix. Also in this run: async error handling corrections and promises moved out of use for
  readability.

## 1.0.16 - 2024-07-04

- Corrected async error handling.

## 1.0.15 - 2023-07-21

- Moved to ESM.

## 1.0.14 - 2023-07-21

## 1.0.13 - 2023-07-20

- Dependency updates.

## 1.0.11 - 2023-02-22

- ACH AVSName, app URL, Twilio encoding and payment link fixes.

## 1.0.10 - 2023-02-21

- Changed auth.

## 1.0.9 - 2023-02-21

- Typo fix.

## 1.0.8 - 2023-02-21

- API authorisation update.

## 1.0.7 - 2022-12-02

## 1.0.5 - 2022-12-02

- Payment links.

## 1.0.4 - 2022-12-02

- Payment links.

## 1.0.2 - 2022-11-14

- Initial app code, restructured into its current layout, plus README and documentation.

---

Entries before 1.0.23 are reconstructed from commit history, so they carry only what the commit
subjects recorded. Versions that were published without a corresponding version-named commit
(1.0.3, 1.0.6, 1.0.12, 1.0.17, 1.0.19-1.0.21) are not listed.
