# Firebase Security Specification

## Data Invariants
1. All users must be authenticated to perform any action in the system.
2. Only `admin` role staff can modify global `settings` or manage `staff`.
3. `attendant` and `supervisor` roles can create `transactions`, `customers`, and manage `shifts` and `bookings`.
4. `transactions` amount must be positive.
5. All references (e.g. `staffId` on a `shift`) must be valid string IDs.

## Dirty Dozen Payloads
1. Unauthorized User creating a transaction (Identity Spoofing).
2. Missing required fields when creating a Customer.
3. Modifying `pointsEarned` after transaction creation (State Shortcutting).
4. Unauthenticated user trying to read `customers`.
5. Non-admin trying to update `settings`.
6. String instead of Number for `loyaltyPoints` (Value Poisoning).
7. ID Poisoning: using an ID longer than 128 characters or with invalid symbols for `transactions`.
8. Updating a `staff` member's role as a non-admin (Privilege Escalation).
9. Blank or missing `staffId` in `shifts`.
10. Creating a `Customer` with `loyaltyPoints` injected as 1,000,000 by an attendant. Wait, attendants can set loyaltyPoints. No, loyaltyPoints should only be updated via transactions, but for now we'll allow creation with 0 points.
11. User creating a shift for another `staffId`.
12. Attempting to write a 1MB string to `customer.name` (Resource Poisoning).

## The Test Runner
A test file will be created to ensure all rules are properly implemented.
