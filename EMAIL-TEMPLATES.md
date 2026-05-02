Simplified Email Templates — ALA House Leaderboard

1) Event Closed (detailed)
Subject: Event closed: {{eventName}}

Body (plain text):
Event "{{eventName}}" was closed by {{closedByEmail}} on {{closedAt}}.
Actions: {{actionCount}}
Delta: {{netDelta}}
Tags: {{tags}}
Notes: {{notes}}

2) Event Closed (short)
Subject: Event summary: {{eventName}}

Body:
{{eventName}} — closed by {{closedByEmail}} — Actions: {{actionCount}} — Delta: {{pointsSummary}}

3) Admin Alert
Subject: ALA Leaderboard Alert: {{summary}}

Body:
{{message}}

Notes:
- Keep emails short and plain-text first; include an HTML version only for richer formatting.
- Use `{{...}}` as simple handlebars-style placeholders for your templating system.
- For production, prefer sending via a server-side function (SendGrid) rather than client-side mailto links.
