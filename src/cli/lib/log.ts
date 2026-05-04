import pc from "picocolors";

export const log = {
  step(message: string): void {
    process.stdout.write(`${pc.cyan("›")} ${message}\n`);
  },

  detail(message: string): void {
    process.stdout.write(`  ${pc.dim(message)}\n`);
  },

  success(message: string): void {
    process.stdout.write(`${pc.green("✓")} ${message}\n`);
  },

  warn(message: string): void {
    process.stderr.write(`${pc.yellow("!")} ${message}\n`);
  },

  error(message: string): void {
    process.stderr.write(`${pc.red("✗")} ${message}\n`);
  },

  url(label: string, url: string): void {
    process.stdout.write(`${pc.bold(label)}: ${pc.cyan(pc.underline(url))}\n`);
  },

  raw(message: string): void {
    process.stdout.write(`${message}\n`);
  },
};

export const c = pc;
