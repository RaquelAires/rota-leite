# Rota Leite | Implementation and delivery case study

Rota Leite is a software engineering MVP for planning and recording dairy collection routes in Colméia, Tocantins, Brazil. It connects two users: a collection manager who plans and closes routes, and a driver who records collected volumes and exceptions in the field, including during connectivity gaps.

| Evidence status | What it covers |
| --- | --- |
| Documented MVP | Manual stop ordering, driver assignment, offline capture and sync, correction history, route closure and CSV export. The local demo uses fictitious records. |
| Proposed pilot | One manager, one driver and one route. The plan, thresholds and example change below are portfolio scenarios. Field results have yet to be measured. |

[Technical documentation and local demo](../README.md) · [Deployment guide](../VERCEL.md)

## Scope and acceptance

The pilot covers the daily workflow from route assignment to CSV reconciliation. Future releases could consider automatic route optimization, GPS tracking or integrations with other systems. The proposed pilot owner coordinates the release, the manager signs off on the operational workflow, the driver validates mobile usability and the technical owner handles environment readiness and defects.

| Acceptance check | Expected evidence |
| --- | --- |
| Manager assigns a route and driver opens it before departure | The assigned driver sees the route. A second driver account cannot access it. |
| Driver records a stop while disconnected | After reconnection, the record appears once in the manager's view. Repeat sync and reconcile against the expected stop count. |
| A second device changes a record before sync | The local entry is held for review. The user can correct against the synced version, with a reason retained in history. |
| Manager closes the route and exports the report | CSV totals reconcile to the recorded stops. Exceptions and stops without records remain visible. Closed stops reject further edits. |

## Proposed delivery and rollout

| Timing | Milestone and owner | Exit evidence |
| --- | --- | --- |
| Week 1 | Pilot owner agrees scope and baseline with the manager. Technical owner prepares staging and verifies Google sign-in, Turso and test accounts. | Manager and driver can sign in with their expected roles. Demo records are identified before use. |
| Week 2 | Manager and driver run a rehearsal with fictitious data on the target phone. Technical owner rehearses sync recovery and verifies closure and CSV. | All acceptance checks pass and the manager approves proceeding with one live route. |
| Week 3 | Driver runs the approved route. Manager reconciles the CSV with the current collection record. Pilot owner reviews the results and open issues. | Manager records a decision to repeat, expand or pause the pilot, with owners and dates for follow-up. |

**Go/no-go.** Proceed when the manager and driver have working accounts, the route has been opened on the device before departure, critical checks pass and the fallback process is ready. If login, persistence or reconciliation fails in the field, pause the rollout, use the existing collection process, preserve pending records for review and reconcile them before restarting. The technical owner investigates. The manager authorizes resumption.

## Risk register

| Risk | Trigger | Response | Owner |
| --- | --- | --- | --- |
| Driver loses connectivity before loading the route | Route unavailable at departure | Add an online preload check to the departure checklist. Keep the current collection process available. | Driver |
| Duplicate or conflicting stop entry | Retried sync or multiple devices change a stop | Rehearse retry and conflict handling. Review unresolved items before closing and compare final records with the field log. | Technical owner and manager |
| Sign-in blocks a pilot participant | Account fails an access check | Verify both accounts and OAuth access in staging ahead of the shift. Escalate before dispatch. | Technical owner |
| Demo data is mistaken for field data | Fictitious records appear in pilot reconciliation | Confirm the pilot dataset and label or remove demo records from the operational view before starting. | Pilot owner |

## Example scope decision

**Scenario:** the manager requests automatic route optimization after the rehearsal. The proposed decision is to defer it to a later release. Manual ordering already supports the pilot, while optimization adds a dependency on location data and requires separate validation. The pilot owner records the request, asks the manager to confirm priority after the pilot and keeps the existing launch date and acceptance criteria.

## Example weekly status update

**Week 2 rehearsal · Amber · Simulated.** The team rehearsed route assignment and closure. Driver sign-in on the target phone remains the launch dependency. The technical owner will retest access before dispatch. The manager's decision is due at the go/no-go checkpoint. If access fails, the team will repeat the rehearsal and retain the current collection process for that shift.

## Pilot measures

| Measure | How to collect it | Proposed decision criterion |
| --- | --- | --- |
| Route closure time | Time from last stop to the manager's validated report. Compare with the same route under the current process. | Establish a baseline first and review any increase before expanding. |
| Exceptions with a reason | Exceptions with a recorded reason divided by all recorded exceptions. Mark shifts with zero exceptions as not applicable. | Every recorded exception has a reason. |
| Duplicate collection records | Reconcile application records against the driver's field log and repeat the sync check. | Zero duplicates attributable to retries. |
| Unresolved sync items | Count entries still pending or awaiting review when the manager is ready to close. | Zero unresolved items at sign-off. |

The evidence to retain is a redacted CSV, completed acceptance checklist, risk and decision updates, and the manager's rollout decision. The repository documents the MVP and its demo. The pilot plan proposes how to validate the operational outcome.
