const MAX_LOGGED_COMMAND_LENGTH = 100;
const MIRROR_UPLOAD_COMMAND =
  /\|\s*base64 -d >> ['"]?\/tmp\/cmux-mirror-[^\s'"]+\.tar\.gz/;

export function formatExecCommandForLog(command: string): string {
  if (MIRROR_UPLOAD_COMMAND.test(command)) {
    return "[redacted Mirror local upload chunk]";
  }
  return command.length > MAX_LOGGED_COMMAND_LENGTH
    ? `${command.slice(0, MAX_LOGGED_COMMAND_LENGTH)}...`
    : command;
}
