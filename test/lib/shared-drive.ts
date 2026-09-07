/**
 * Shared drive used by the shared-drive specs.
 *
 * The drive is provisioned by hand and is never created, renamed, or deleted by
 * the tests. Creating a shared drive requires a Google Workspace account, and
 * this suite authenticates as a consumer account that is only a *member* of the
 * drive; `drives.create` would fail for it. The id is part of the test
 * environment, like the OAuth token - a missing one is a broken environment, not
 * a reason to skip.
 *
 * Setup:
 *   1. In a Workspace account, create a shared drive.
 *   2. Add the test account as Manager. Manager, not Content manager: cleanup
 *      uses `files.delete`, which is a permanent delete.
 *   3. Put its id in `.env.test` as TEST_SHARED_DRIVE_ID.
 *
 * Tests delete only what they create inside the drive.
 */
// Loads .env.test. The unit suite otherwise reads only ambient shell environment;
// TEST_SHARED_DRIVE_ID and GOOGLE_SERVICE_ACCOUNT_KEY_FILE live in .env.test alone.
// dotenv does not override variables already set, so shell values still win.
import './env-loader.ts';

export function testSharedDriveId(): string {
  const id = process.env.TEST_SHARED_DRIVE_ID;
  if (!id) {
    throw new Error('TEST_SHARED_DRIVE_ID is not set. Add the id of the hand-provisioned shared drive to .env.test - see test/lib/shared-drive.ts for the setup steps.');
  }
  return id;
}
