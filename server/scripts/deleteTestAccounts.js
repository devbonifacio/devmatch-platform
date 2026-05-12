/**
 * Run once to delete test accounts from MongoDB.
 * Usage (from server/ folder):
 *   node scripts/deleteTestAccounts.js
 *
 * Keeps any user whose name (case-insensitive) contains "marta clemente".
 * Deletes users whose names match known test patterns.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const TEST_NAME_PATTERNS = [
  /^ale[\s_-]?test$/i,
  /^devtest$/i,
  /^aha$/i,
  /^test/i,
  /^dev[\s_-]?test/i,
];

const KEEP_PATTERNS = [
  /marta[\s_-]?clemente/i,
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const User    = (await import('../models/User.js')).default;
  const Match   = (await import('../models/Match.js')).default;
  const Message = (await import('../models/Message.js')).default;

  const users = await User.find({}).select('_id name email').lean();

  const toDelete = users.filter((u) => {
    const name = (u.name || '').trim();
    const keep = KEEP_PATTERNS.some((re) => re.test(name));
    if (keep) return false;
    return TEST_NAME_PATTERNS.some((re) => re.test(name));
  });

  if (toDelete.length === 0) {
    console.log('No test accounts found. Nothing to delete.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nAccounts to be deleted (${toDelete.length}):`);
  toDelete.forEach((u) => console.log(`  - "${u.name}" (${u.email}) [${u._id}]`));

  const ids = toDelete.map((u) => u._id);

  // Delete matches that include any of these users
  const matchResult = await Match.deleteMany({ users: { $in: ids } });
  console.log(`\nDeleted ${matchResult.deletedCount} match(es).`);

  // Delete messages sent by these users (matchId-based cleanup via match deletion above covers most)
  const msgResult = await Message.deleteMany({ sender: { $in: ids } });
  console.log(`Deleted ${msgResult.deletedCount} message(s).`);

  // Delete the user accounts
  const userResult = await User.deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${userResult.deletedCount} user account(s).`);

  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
