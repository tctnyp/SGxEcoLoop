# Impact calibration and pilot validation

novo deliberately keeps measured impact separate from estimates. The application must not invent a weight, a pilot result, or a participant action.

## Calibrate item weights

Before enabling automatic impact credit for an item category:

1. Physically weigh at least 10 representative items from that category on a real scale.
2. Record each measured weight in kilograms. Do not substitute a visual estimate or a YOLO confidence score.
3. Submit the measurements through `PUT /api/portal/impact/calibrations/:key` as an administrator or staff member. The API rejects fewer than 10 samples.
4. Label the calibration with its waste stream, action, unit, measurement date, and a useful source note.
5. Verify the stored mean and sample count through `GET /api/portal/impact/calibrations`.

YOLO may identify an object or help route a submission for review. It does not measure mass. Staff may enter a scale reading while approving a submission. Automatic impact is applied only when a measured or properly calibrated weight is available.

## Backfill existing approvals

Run the backfill in dry-run mode first:

```sh
npm run impact:backfill --workspace @novo/server
```

Review every proposed update, then explicitly apply it:

```sh
npm run impact:backfill:apply --workspace @novo/server
```

The script is idempotent and skips records without a measured weight or matching calibration. It never guesses missing data.

## Run the pilot

Recruit 10–20 consenting participants for 3–5 days. Explain what data is collected and identify internal team accounts as test data. Use the demo bypass only for demo accounts; the development service enables it with `NOVO_PILOT_BYPASS=1`. Production accounts continue through the full onboarding gate.

At the start and end of the pilot, record:

- number of participants active on day 1 and again on day 7, when a seven-day observation is available;
- average current streak;
- approved quests per active participant;
- total measured/calibrated kilograms by waste stream and action;
- qualitative feedback and any failed or abandoned onboarding steps.

Administrators and staff can read live aggregates from `GET /api/portal/pilot-metrics`. Treat metrics as test data until the pilot classification is removed. A 3–5 day pilot cannot honestly produce a day-7 result; report that value as pending and follow up on day 7.

## Impact claims

- Food-waste CO2e is shown as a labelled estimate using the configured lifecycle factor and its caveat.
- Plastic impact is reported in kilograms only; novo does not display a plastic CO2e number.
- Community impact includes only approved submissions whose impact has been applied once.
- Charity contributions, marketplace redemptions, and weekly entries are displayed as activity history, not converted into environmental impact unless a measured methodology is added later.

The in-app NEA education cards link to the source statistics. Refresh those values and their publication years when NEA releases newer official data.
