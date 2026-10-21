# Engineering harness maintenance

- Maintain shared content in `bundle/` and behavior tests in `tests/`. Keep the existing root API guides and their catalog separate.
- Run `python3 -m unittest discover -s engineering/tests -v` from the repository root after changes to the tool or bundle.
- Preserve existing consumer instructions and unrelated skills. Validate collisions before writing, pin committed source, and keep ordinary CI usable without source credentials.
- Treat lock changes as dependency updates. Keep source PRs and consumer rollout PRs reviewable; refresh consumer pins to the merged central commit when using squash merges.
