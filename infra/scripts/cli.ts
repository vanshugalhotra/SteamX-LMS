/** CLI entry point for lifecycle scripts. */
const COMMANDS: Record<string, string> = {
  deploy: './deploy.js',
  stop: './stop.js',
  start: './start.js',
  destroy: './destroy.js',
  'destroy-data': './destroy-data.js',
  'destroy-all': './destroy-all.js',
  'create-admin': './create-admin.js',
};

const command = process.argv[2];
if (!command || !(command in COMMANDS)) {
  console.error(
    `Unknown command: ${command ?? '(none)'}.\nAvailable commands: ${Object.keys(COMMANDS).join(', ')}`,
  );
  process.exit(1);
}

// Forward remaining args: strip 'node cli.ts <command>' → pass everything after the command
process.argv = [process.argv[0]!, process.argv[1]!, ...process.argv.slice(3)];
await import(COMMANDS[command]!);
