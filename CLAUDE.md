## Inter-Agent Collaboration

When facing architectural decisions, complex debugging, or situations where a second opinion from a different AI model would add value, suggest running `/collaborate` or `/debate` with the relevant context.

### When to suggest `/debate`
- Choosing between two viable architectural approaches
- Trade-off-heavy decisions where both sides have merit
- Complex debugging that has failed after initial attempts

### When to suggest `/collaborate`
- Mid-task code review (have the other model review what you just built)
- Design consultation before committing to an approach
- Validating assumptions, test coverage, or edge cases
- Reviewing security-sensitive code

Do not suggest either for straightforward tasks, simple bug fixes, or questions with clear answers.
