import { ensurePlaywrightFinanceFixture } from "../e2e/helpers/finance-fixture";

ensurePlaywrightFinanceFixture()
  .then((result) => {
    console.log(JSON.stringify({ ok: true, fixture: result }, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
