# Security findings

## SF-001 — Bearer token exposed in Redmine #38835 (open)
- **Where:** Redmine issue #38835 ("Discount approval workflow not working", Medvista), `description` field — a pasted `curl` command containing an `Authorization: Bearer <JWT>` header for a UAT environment.
- **Found:** 2026-11-02, incidentally, when the ticket was read through the Redmine reader MCP during an investigation.
- **Handling:** the token was not decoded, reused, tested or copied anywhere (not in this repo, notes, tests or logs). Redmine was not modified.
- **Risk:** anyone with read access to the ticket (and to the MCP/AI sessions that read it) holds a credential. JWTs of this kind typically carry user identity, roles and site/customer claims. Its `exp` claim is set, so it may already be expired — **not verified**; treat as compromised regardless.
- **Recommended actions (need an authorised owner):**
  1. Revoke the session / rotate or invalidate the credential for the affected user in the UAT identity provider (Keycloak realm), and review its access logs for the exposure window.
  2. Redact the header in the ticket (edit the description; remove it from journal/revision history if the Redmine edition keeps it).
  3. Check whether the same ticket text was copied to Mattermost, email, or other AI session transcripts.
  4. Add a team rule: redact `Authorization`/cookie headers when pasting curl commands (the platform's `security.md` SR-01 already forbids credentials in code).
- **Platform mitigation (optional follow-up):** a redaction pass in the Redmine MCP read path (mask `Bearer …`, `Authorization:`, `Cookie:`) so tokens never reach model context. Not implemented.
