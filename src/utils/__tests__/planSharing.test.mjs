import assert from "node:assert/strict";
import test from "node:test";

import planSharing from "../planSharing.ts";

const {
  createPlanShareFileContents,
  createPlanShareMessage,
  createPlanShareUrl,
  isPlanShareUrl,
  parsePlanShareText,
  parsePlanShareUrl
} = planSharing;

const plan = {
  id: 42,
  name: "Morning strength",
  loops: 1,
  workoutDays: [1, 3, 5],
  createdAt: 1_700_000_000_000,
  sections: [
    {
      id: 7,
      name: "Main set",
      loops: 3,
      restSeconds: 45,
      exercises: [
        { id: 8, name: "Push-ups", workSeconds: 40, restSeconds: 20 },
        { id: 9, name: "Squats", workSeconds: 50, restSeconds: 10 }
      ]
    }
  ],
  exercises: []
};

test("a shared plan round-trips without local database IDs", () => {
  const url = createPlanShareUrl(plan);
  const imported = parsePlanShareUrl(url);

  assert.equal(isPlanShareUrl(url), true);
  assert.deepEqual(imported, {
    name: "Morning strength",
    loops: 1,
    workoutDays: [1, 3, 5],
    sections: [
      {
        name: "Main set",
        loops: 3,
        restSeconds: 45,
        exercises: [
          { name: "Push-ups", workSeconds: 40, restSeconds: 20 },
          { name: "Squats", workSeconds: 50, restSeconds: 10 }
        ]
      }
    ],
    exercises: [
      { name: "Push-ups", workSeconds: 40, restSeconds: 20 },
      { name: "Squats", workSeconds: 50, restSeconds: 10 }
    ]
  });
});

test("the share text includes an Anthra fallback for non-users", () => {
  const message = createPlanShareMessage(plan);
  assert.match(message, /anthra:\/\/plan\/import\?data=/);
  assert.match(message, /Plans → Import → Paste shared link/);
  assert.equal(parsePlanShareText(message)?.name, "Morning strength");
});

test("a portable Anthra plan file round-trips", () => {
  const fileContents = createPlanShareFileContents(plan);
  const imported = parsePlanShareText(fileContents);

  assert.equal(imported?.name, "Morning strength");
  assert.equal(imported?.sections.length, 1);
  assert.equal(imported?.sections[0].exercises.length, 2);
});

test("malformed and unsafe plan links are rejected", () => {
  assert.equal(parsePlanShareUrl("https://example.com/plan"), null);
  assert.equal(parsePlanShareUrl("anthra://plan/import?data=not-json"), null);

  const invalidPayload = encodeURIComponent(
    JSON.stringify({
      v: 1,
      plan: {
        name: "Bad plan",
        workoutDays: [1],
        sections: [
          {
            name: "Main",
            loops: 1,
            restSeconds: 0,
            exercises: [{ name: "Push-ups", workSeconds: -10, restSeconds: 0 }]
          }
        ]
      }
    })
  );
  assert.equal(parsePlanShareUrl(`anthra://plan/import?data=${invalidPayload}`), null);
});
