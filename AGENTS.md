# Repository release requirement

A major change is not complete until the Mobile Release GitHub Actions workflow succeeds and publishes all four binaries to a GitHub release:

- `novo-development.apk` and `novo-development.ipa` must embed `https://novodev.tancheetiong.com/api`.
- `novo-production.apk` and `novo-production.ipa` must embed `https://novo.tancheetiong.com/api`.
- IPA files remain unsigned for SideStore to re-sign.
- Android uses the generated local install signature because Android cannot install a truly unsigned APK; no production signing credential is required.

Trigger the workflow with a semantic release tag such as `v1.0.6`, wait for every build and publish job, and report the release URL. Do not claim a major change is complete while any binary or the GitHub release is missing.
