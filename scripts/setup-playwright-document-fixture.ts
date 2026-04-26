import {
  ensurePlaywrightDocumentFixture,
  type PlaywrightDocumentFixtureScenario,
} from "../e2e/helpers/document-fixture";

const scenarioArg = process.argv[2] as PlaywrightDocumentFixtureScenario | undefined;

ensurePlaywrightDocumentFixture({ scenario: scenarioArg })
  .then((result) => {
    console.log(JSON.stringify({ ok: true, fixture: result }, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
