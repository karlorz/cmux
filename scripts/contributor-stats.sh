#!/usr/bin/env bash

# Contributor Statistics Script
# Calculates PRs merged, commits, and lines of code changed per contributor
# Excludes lockfiles and generated files

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Lockfile and generated file patterns to exclude
EXCLUDE_PATTERN='(package-lock\.json|bun\.lock|bun\.lockb|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|composer\.lock|Gemfile\.lock|poetry\.lock|\.min\.js|\.min\.css|\.woff|\.woff2|\.ttf|\.otf|\.eot|data/.*\.json|packages/www-openapi-client/src/client/types\.gen\.ts)'

show_help() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Calculate contributor statistics for git repository.

OPTIONS:
    -d, --days NUM          Calculate stats for last NUM days (default: 30)
    -s, --since DATE        Start date (format: YYYY-MM-DD)
    -u, --until DATE        End date (format: YYYY-MM-DD)
    -t, --today             Show stats for today only
    -w, --week              Show stats for this week
    -m, --month             Show stats for this month
    --top NUM               Show top NUM most productive days (default: 10)
    --daily                 Show daily breakdown
    --all-time-top NUM      Show top NUM most productive days ever (per-contributor breakdown)
    -h, --help              Show this help message

EXAMPLES:
    $(basename "$0") --today                    # Today's stats
    $(basename "$0") --week                     # This week's stats
    $(basename "$0") --days 7                   # Last 7 days
    $(basename "$0") --since 2025-11-01         # Since Nov 1
    $(basename "$0") --top 5 --daily            # Show daily breakdown and top 5 days
    $(basename "$0") --all-time-top 15          # Top 15 most productive days ever

EOF
    exit 0
}

# Parse arguments
DAYS=""
SINCE=""
UNTIL=""
TOP_DAYS=10
SHOW_DAILY=false
ALL_TIME_TOP=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        -d|--days)
            DAYS="$2"
            shift 2
            ;;
        -s|--since)
            SINCE="$2"
            shift 2
            ;;
        -u|--until)
            UNTIL="$2"
            shift 2
            ;;
        -t|--today)
            SINCE="$(TZ='America/Los_Angeles' date -d 'today 00:00:00' '+%Y-%m-%d')"
            UNTIL="$(TZ='America/Los_Angeles' date -d 'tomorrow 00:00:00' '+%Y-%m-%d')"
            shift
            ;;
        -w|--week)
            SINCE="$(TZ='America/Los_Angeles' date -d 'last monday' '+%Y-%m-%d')"
            shift
            ;;
        -m|--month)
            SINCE="$(TZ='America/Los_Angeles' date -d 'first day of this month' '+%Y-%m-%d')"
            shift
            ;;
        --top)
            TOP_DAYS="$2"
            shift 2
            ;;
        --daily)
            SHOW_DAILY=true
            shift
            ;;
        --all-time-top)
            ALL_TIME_TOP="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            ;;
    esac
done

# Handle --all-time-top mode (separate mode that exits after displaying)
if [[ -n "$ALL_TIME_TOP" ]]; then
    set +e  # Temporarily disable strict error mode for this section

    echo -e "${BLUE}=== Top $ALL_TIME_TOP Most Productive Days (All Time) ===${NC}"
    echo ""

    # Get all unique dates from git history
    dates=$(git log --all --no-merges --pretty=format:"%ai" | awk '{print $1}' | sort -u)

    declare -a daily_results=()

    for date in $dates; do
        next_date=$(TZ='America/Los_Angeles' date -d "$date + 1 day" '+%Y-%m-%d' 2>/dev/null || date -d "$date + 1 day" '+%Y-%m-%d')

        # Get stats for Lawrence Chen
        lawrence_data=$(git log --since="$date 00:00:00" --until="$next_date 00:00:00" --all --no-merges --author="Lawrence Chen" --numstat --pretty=format:"" | \
            grep -v -E "$EXCLUDE_PATTERN" | \
            awk '{added+=$1; deleted+=$2} END {printf "%d|%d", added, deleted}')

        # Get stats for Austin (both austinpower1258 and Austin Wang)
        austin_data=$(git log --since="$date 00:00:00" --until="$next_date 00:00:00" --all --no-merges --author="Austin" --numstat --pretty=format:"" | \
            grep -v -E "$EXCLUDE_PATTERN" | \
            awk '{added+=$1; deleted+=$2} END {printf "%d|%d", added, deleted}')

        # Get commit counts
        lawrence_commits=$(git log --since="$date 00:00:00" --until="$next_date 00:00:00" --all --no-merges --author="Lawrence Chen" --oneline 2>/dev/null | wc -l | tr -d ' ')
        austin_commits=$(git log --since="$date 00:00:00" --until="$next_date 00:00:00" --all --no-merges --author="Austin" --oneline 2>/dev/null | wc -l | tr -d ' ')

        # Get PR counts
        lawrence_prs=$(git log --since="$date 00:00:00" --until="$next_date 00:00:00" --all --merges --author="Lawrence Chen" --pretty=format:"%s" 2>/dev/null | grep -c "Merge pull request" || echo 0)
        austin_prs=$(git log --since="$date 00:00:00" --until="$next_date 00:00:00" --all --merges --author="Austin" --pretty=format:"%s" 2>/dev/null | grep -c "Merge pull request" || echo 0)

        IFS='|' read -r l_add l_del <<< "$lawrence_data"
        IFS='|' read -r a_add a_del <<< "$austin_data"

        l_add=${l_add:-0}
        l_del=${l_del:-0}
        a_add=${a_add:-0}
        a_del=${a_del:-0}

        l_total=$((l_add + l_del))
        a_total=$((a_add + a_del))
        combined_total=$((l_total + a_total))

        if [[ $combined_total -gt 0 ]]; then
            daily_results+=("$date|$combined_total|$lawrence_commits|$lawrence_prs|$l_add|$l_del|$l_total|$austin_commits|$austin_prs|$a_add|$a_del|$a_total")
        fi
    done

    # Sort by combined total and display top N
    if [[ ${#daily_results[@]} -gt 0 ]]; then
        printf '%s\n' "${daily_results[@]}" | grep -E '^[0-9]{4}-' | sort -t'|' -k2 -rn | head -n "$ALL_TIME_TOP" | while IFS='|' read -r date total l_c l_pr l_add l_del l_tot a_c a_pr a_add a_del a_tot; do
            # Ensure values are set
            l_c=${l_c:-0}; l_pr=${l_pr:-0}; l_add=${l_add:-0}; l_del=${l_del:-0}; l_tot=${l_tot:-0}
            a_c=${a_c:-0}; a_pr=${a_pr:-0}; a_add=${a_add:-0}; a_del=${a_del:-0}; a_tot=${a_tot:-0}

            echo -e "${CYAN}$date${NC} (${BLUE}$total total lines${NC})"
            echo -e "  ${GREEN}Lawrence:${NC} $l_c commits, $l_pr PRs, +$l_add -$l_del = $l_tot lines"
            echo -e "  ${GREEN}Austin:${NC} $a_c commits, $a_pr PRs, +$a_add -$a_del = $a_tot lines"
            echo ""
        done
    else
        echo "No data found."
    fi

    set -e  # Re-enable strict error mode

    exit 0
fi

# Set default if no date range specified
if [[ -z "$SINCE" && -z "$DAYS" ]]; then
    DAYS=30
fi

# Convert DAYS to actual date range
if [[ -n "$DAYS" ]]; then
    SINCE="$(TZ='America/Los_Angeles' date -d "$DAYS days ago" '+%Y-%m-%d')"
    UNTIL="$(TZ='America/Los_Angeles' date '+%Y-%m-%d')"
fi

# Set default UNTIL if not specified
if [[ -z "$UNTIL" ]]; then
    UNTIL="$(TZ='America/Los_Angeles' date '+%Y-%m-%d')"
fi

# Build date filter for git log
DATE_FILTER="--since=\"$SINCE 00:00:00 -0800\""
if [[ -n "$UNTIL" ]]; then
    DATE_FILTER="$DATE_FILTER --until=\"$UNTIL 00:00:00 -0800\""
fi

echo -e "${BLUE}=== Contributor Statistics ===${NC}"
echo ""

# Function to get stats for a specific date
get_daily_stats() {
    local date=$1
    local next_date=$(TZ='America/Los_Angeles' date -d "$date + 1 day" '+%Y-%m-%d')

    # Get commit count
    local commits=$(git log --since="$date 00:00:00 -0800" --until="$next_date 00:00:00 -0800" --all --no-merges --oneline | wc -l)

    # Get PR count
    local prs=$(git log --since="$date 00:00:00 -0800" --until="$next_date 00:00:00 -0800" --all --merges --oneline | grep -c "Merge pull request" || true)

    # Get line changes
    local lines=$(git log --since="$date 00:00:00 -0800" --until="$next_date 00:00:00 -0800" --all --no-merges --numstat --pretty=format:"" | \
        grep -v -E "$EXCLUDE_PATTERN" | \
        awk '{added+=$1; deleted+=$2} END {print added+deleted}')

    if [[ -z "$lines" ]]; then
        lines=0
    fi

    echo "$date|$commits|$prs|$lines"
}

# Function to get contributor stats for a date range
get_contributor_stats() {
    local since=$1
    local until=$2

    echo -e "${CYAN}Period: $since to $until${NC}"
    echo ""

    # Get all contributors
    local contributors=$(eval git log $DATE_FILTER --all --no-merges --pretty=format:\"%an\" | sort -u)

    echo -e "${YELLOW}By Contributor:${NC}"
    echo ""

    while IFS= read -r author; do
        if [[ -z "$author" ]]; then
            continue
        fi

        # Count commits
        local commits=$(eval git log $DATE_FILTER --all --no-merges --author=\"$author\" --oneline | wc -l)

        # Count PRs merged by this person
        local prs=$(eval git log $DATE_FILTER --all --merges --author=\"$author\" --pretty=format:\"%s\" | grep -c "Merge pull request" || true)

        # Calculate line changes
        local stats=$(eval git log $DATE_FILTER --all --no-merges --author=\"$author\" --numstat --pretty=format:\"\" | \
            grep -v -E \"$EXCLUDE_PATTERN\" | \
            awk '{added+=$1; deleted+=$2} END {printf "+%d -%d total:%d", added, deleted, added+deleted}')

        if [[ $commits -gt 0 ]]; then
            echo -e "${GREEN}$author${NC}"
            echo "  PRs Merged: $prs"
            echo "  Commits: $commits"
            echo "  Lines: $stats"
            echo ""
        fi
    done <<< "$contributors"
}

# Show overall stats
get_contributor_stats "$SINCE" "$UNTIL"

# Show daily breakdown if requested
if [[ "$SHOW_DAILY" == true ]]; then
    echo -e "${YELLOW}=== Daily Breakdown ===${NC}"
    echo ""

    # Get all dates in range
    current_date=$SINCE
    end_date=${UNTIL:-$(TZ='America/Los_Angeles' date '+%Y-%m-%d')}

    declare -a daily_data=()

    while [[ "$current_date" < "$end_date" ]]; do
        stats=$(get_daily_stats "$current_date")
        IFS='|' read -r date commits prs lines <<< "$stats"

        if [[ $commits -gt 0 ]] || [[ $prs -gt 0 ]]; then
            daily_data+=("$stats")
            echo -e "${CYAN}$date${NC}: $commits commits, $prs PRs merged, $lines lines changed"
        fi

        current_date=$(TZ='America/Los_Angeles' date -d "$current_date + 1 day" '+%Y-%m-%d')
    done
    echo ""

    # Show top productive days
    if [[ ${#daily_data[@]} -gt 0 ]]; then
        echo -e "${YELLOW}=== Top $TOP_DAYS Most Productive Days (by lines changed) ===${NC}"
        echo ""

        printf '%s\n' "${daily_data[@]}" | \
            sort -t'|' -k4 -rn | \
            head -n "$TOP_DAYS" | \
            while IFS='|' read -r date commits prs lines; do
                echo -e "${GREEN}$date${NC}: $commits commits, $prs PRs merged, ${BLUE}$lines lines${NC}"
            done
    fi
fi
