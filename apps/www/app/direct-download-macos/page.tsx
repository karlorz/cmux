import { fetchLatestRelease } from "@/lib/fetch-latest-release";
import { normalizeMacArchitecture, pickMacDownloadUrl } from "@/lib/utils/mac-architecture";
import { DirectDownloadRedirector } from "@/app/direct-download-macos/redirector";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const normalizeSearchParam = (
  value: string | string[] | undefined,
): string | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
};

const pageContainerClasses =
  "min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center px-6 py-12";
const cardClasses =
  "w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40";
const headingClasses = "text-2xl font-semibold tracking-tight";
const paragraphClasses = "mt-3 text-sm text-neutral-300 leading-relaxed";
const linkClasses =
  "mt-6 inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10";

export default async function DirectDownloadPage({ searchParams }: PageProps) {
  const { macDownloadUrls, fallbackUrl, latestVersion } = await fetchLatestRelease();
  const queryArchitecture = normalizeMacArchitecture(
    normalizeSearchParam(searchParams?.arch),
  );
  const initialUrl = pickMacDownloadUrl(
    macDownloadUrls,
    fallbackUrl,
    queryArchitecture ?? null,
  );

  return (
    <div className={pageContainerClasses}>
      <DirectDownloadRedirector
        macDownloadUrls={macDownloadUrls}
        fallbackUrl={fallbackUrl}
        initialUrl={initialUrl}
        queryArchitecture={queryArchitecture}
      />
      <div className={cardClasses}>
        <h1 className={headingClasses}>Preparing your download…</h1>
        <p className={paragraphClasses}>
          We&apos;re detecting your Mac&apos;s architecture to send you the best build of
          cmux automatically. If nothing happens shortly, use the manual download below.
        </p>
        {latestVersion ? (
          <p className="mt-4 text-xs text-neutral-400">
            Latest release: cmux {latestVersion}
          </p>
        ) : null}
        <a className={linkClasses} href={initialUrl}>
          Download manually
        </a>
      </div>
    </div>
  );
}
