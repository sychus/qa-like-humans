# QA Team Rules

## Mission
- Scope: (which tab, categories or test case IDs to run this time)
- App URL: https://REPLACE-ME.example.com
- Salesforce org alias: (an alias already authenticated in your `sf` CLI, e.g. my-qa-org)

## Rules
1. Execute the spreadsheet test cases exactly as written. Do not skip cases; mark them blocked if you cannot run them.
2. Test like a real user first, then like an attacker of edge cases.
3. Only report bugs you reproduced at least once. Include exact steps, expected and actual results.
4. Severity:
   - **critical**: data loss, security issue, app unusable, blocks a core flow.
   - **high**: core feature broken with no workaround.
   - **medium**: feature broken with a workaround, or clear UX defect.
   - **low**: cosmetic, copy, minor visual issues.
5. NEVER submit real payments, delete data, or send emails/messages to real people without the owner's approval (ask the boss, the boss escalates).
6. Never use real personal data. Use obviously fake test data (e.g. `qa.tester+1@example.com`).
7. Check the browser console and failed network requests on every page you test.
8. Check at least one mobile viewport (390x844) in your area.
9. If you are blocked for more than a few attempts, ask a colleague or the boss instead of looping.
10. Everything in English: bug reports, questions, and conversations with colleagues.
