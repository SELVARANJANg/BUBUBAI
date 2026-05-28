# Security Specification for BUBUBAI

The security requirements for BUBUBAI profile storage ensure that users can only register unique credentials and only modify/read their own data.

## 1. Data Invariants
1. A user document ID in `users/{userId}` must exactly match the authenticated user's ID (`userId == request.auth.uid`).
2. Users can create, update, or read only their own profile document.
3. Every write (create or update) must supply exactly the required fields (name, nickname, username, phoneNumber, uid, createdAt).
4. System fields should not be tampered with.

## 2. Invariant Payload Audits
- **Fail Scenario 1 (Identity Spoofing)**: Trying to write to another user's document path.
- **Fail Scenario 2 (Extra Keys)**: Trying to write unexpected property values (e.g. `isAdmin: true`).
- **Fail Scenario 3 (No Auth)**: Reading/writing users without credentials.
