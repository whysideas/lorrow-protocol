// Fixture: exit without cleanup after the journal flush to exercise crash recovery.
import fs from 'node:fs';
import {Journal} from '../../witness/journal.mjs';
const record=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const journal=new Journal(process.argv[2],record.address);journal.append(record);process.exit(0);
