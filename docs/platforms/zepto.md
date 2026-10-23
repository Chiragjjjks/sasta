# zepto

**Verdict:** ? (A = direct HTTP, B = needs WebView, X = login or blocked)

| Item | Finding |
|---|---|
| Search endpoint | |
| Method and params | |
| How location is set | |
| Required headers and tokens | |
| Login needed to search | |
| Rate limiting or bot protection | |
| Title / price / MRP / stock / ETA / image / id paths | |
| Product deep link format | |

**Fixture:** `fixtures/zepto/lays.json`

## Notes

## Logged in

| Item | Finding |
|---|---|
| Session cookie | `user_id`. Not `session_id`, which anonymous visits also get |
| Bot protection | Aggressive. Third-party tools drive a real Chrome rather than raw HTTP |

Source (third-party): [quick-commerce-mcp auth notes](https://github.com/Hardik500/quick-commerce-mcp/blob/main/AUTHENTICATION.md).
