export class Logger {
  static info(msg: string): void {
    // Diagnostic logs go to stderr so they never corrupt stdout UI (boxes, streams)
    console.error(`[INFO] ${msg}`);
  }

  static error(msg: string): void {
    console.error(`[ERROR] ${msg}`);
  }

  static debug(msg: string): void {
    if (process.env.DEBUG) {
      console.error(`[DEBUG] ${msg}`);
    }
  }

  static warn(msg: string): void {
    console.warn(`[WARN] ${msg}`);
  }
}
