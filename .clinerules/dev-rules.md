# Project Development Rules

## Communication
- Communicate with user in **Russian** for all conversations and explanations
- Use **English only** for: code, documentation, commit messages, and any text within the application

## Code Quality

### DRY Principle
- Identify and extract repeated code patterns into reusable functions
- If code block appears more than twice, create a utility function
- Consolidate similar logic into single parameterized functions

### Clean Code Standards
- Write self-documenting code with clear, descriptive names
- Keep functions small and focused on single responsibility
- Use meaningful variable names (e.g., jobTitle, companyName, autoApplyRunning)
- Prefer explicit over implicit behavior
- Use async/await for asynchronous operations
- Implement proper error handling with try-catch blocks

## No Code Comments
- **DO NOT leave comments in code** - write self-explanatory code instead
- Provide explanations in chat messages or task completion summaries
- Exception: JSDoc for public API functions only

## Change Transparency
When modifying existing code, always explain:
1. **What was changed** - specific functions/files modified
2. **Why the change was necessary** - bug description, performance improvement, or better approach
3. **Impact of the change** - behavior differences, side effects, benefits gained

## Error Fixes
When fixing bugs:
- Describe the original error clearly
- Explain root cause analysis
- Detail the solution approach
- Mention preventive measures added

## Best Practices
- Minimize DOM queries - cache selectors when reused
- Use event delegation for dynamic content
- Implement proper delays between actions
- Clean up event listeners and observers
- Validate and sanitize all user inputs
- Handle errors gracefully with context logging
- Test edge cases and error conditions
