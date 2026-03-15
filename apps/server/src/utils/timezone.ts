const VALID_TIMEZONE_PATTERN = /^[A-Za-z0-9_.+-]+(?:\/[A-Za-z0-9_.+-]+)*$/;

const shellSingleQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

export function isValidTimezoneIdentifier(timezone: string): boolean {
  return (
    VALID_TIMEZONE_PATTERN.test(timezone) &&
    timezone.split("/").every((segment) => segment !== "." && segment !== "..")
  );
}

export function buildSystemTimezoneStartupCommand(
  timezone: string
): string | null {
  if (!isValidTimezoneIdentifier(timezone)) {
    return null;
  }

  const quotedTimezone = shellSingleQuote(timezone);
  const zoneInfoPath = shellSingleQuote(`/usr/share/zoneinfo/${timezone}`);

  return [
    `if [ -e ${zoneInfoPath} ]; then`,
    `timedatectl set-timezone ${quotedTimezone} 2>/dev/null ||`,
    `{ ln -snf ${zoneInfoPath} /etc/localtime && printf '%s\\n' ${quotedTimezone} > /etc/timezone; } ||`,
    `printf 'cmux: failed to set system timezone to %s\\n' ${quotedTimezone} >&2;`,
    `else`,
    `printf 'cmux: timezone %s not found, skipping system timezone update\\n' ${quotedTimezone} >&2;`,
    `fi`,
  ].join(" ");
}
