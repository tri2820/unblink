import { table_users } from './backend/database';
import { randomUUID } from 'crypto';
import { createInterface } from 'node:readline/promises';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function hashPassword(password: string): Promise<string> {
    return await Bun.password.hash(password, {
        algorithm: "argon2id",
        memoryCost: 4,
        timeCost: 3,
    });
}

async function listUsers() {
    const users = await table_users.query().toArray();
    if (users.length === 0) {
        console.log("No users found.");
        return;
    }
    console.log("Users:");
    users.forEach(user => {
        // @ts-ignore
        console.log(`  - Username: ${user.username}, Role: ${user.role}`);
    });
}

function showHelp() {
    console.log(`
Usage: bun run admin.ts [command]

Commands:
  add         Add a new user
  update      Update an existing user's password
  list        List all users
  help, --help Show this help message
    `);
}

async function addUser() {
    const username = (await rl.question('Enter username: ')).trim();
    if (!username) {
        throw new Error('Username cannot be empty.');
    }

    const existingUser = await table_users.query().where(`username = '${username}'`).limit(1).toArray();
    if (existingUser.length > 0) {
        throw new Error(`User '${username}' already exists.`);
    }

    const password = (await rl.question('Enter password: ')).trim();
    if (!password) {
        throw new Error('Password cannot be empty.');
    }

    let role = '';
    const validRoles = ['admin', 'viewer'];
    while (true) {
        role = (await rl.question('Enter role (admin | viewer): ')).trim();
        if (validRoles.includes(role)) {
            break;
        }
        console.log('Invalid role. Please enter "admin" or "viewer".');
    }

    const argonHash = await hashPassword(password);
    const id = randomUUID();
    await table_users.add([{ id, username, password_hash: argonHash, role }]);
    console.log(`New user '${username}' created successfully with role '${role}'.`);
}

async function updateUser() {
    const username = (await rl.question('Enter username: ')).trim();
    if (!username) {
        throw new Error('Username cannot be empty.');
    }

    const existingUser = await table_users.query().where(`username = '${username}'`).limit(1).toArray();
    if (existingUser.length === 0) {
        throw new Error(`User '${username}' not found.`);
    }

    const password = (await rl.question('Enter new password: ')).trim();
    if (!password) {
        throw new Error('Password cannot be empty.');
    }

    const argonHash = await hashPassword(password);
    await table_users.mergeInsert("username")
        .whenMatchedUpdateAll()
        .execute([{ username, password_hash: argonHash }]);
    console.log(`Password for user '${username}' has been updated successfully.`);
}

async function main() {
    try {
        const command = process.argv[2];

        switch (command) {
            case 'add':
                await addUser();
                break;
            case 'update':
                await updateUser();
                break;
            case 'list':
                await listUsers();
                break;
            case 'help':
            case '--help':
            case undefined: // Default case
                showHelp();
                break;
            default:
                console.log(`Unknown command: ${command}\n`);
                showHelp();
                process.exitCode = 1;
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        }
        else {
            console.error(error);
        }
        process.exitCode = 1;
    }
    finally {
        rl.close();
    }
}

main();