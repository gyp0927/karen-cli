export class Logger {
  static info(msg: string): void {
    console.log(`[INFO] ${msg}`);
  }

  static error(msg: string): void {
    console.error(`[ERROR] ${msg}`);
  }

  static debug(msg: string): void {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${msg}`);
    }
  }
}
