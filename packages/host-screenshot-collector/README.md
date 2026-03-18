# @cmux/host-screenshot-collector

Screenshot and video recording collector for cmux sandbox environments.

## Overview

This package provides tools for capturing and processing screen recordings in cmux sandboxes. It monitors Claude agent activity and creates workflow videos with cursor overlays.

## Features

- **Screenshot Collection**: Captures screenshots during agent execution
- **Video Recording**: Records screen activity as MP4
- **Cursor Overlay**: Adds cursor animation based on click events
- **GIF Generation**: Creates preview GIFs for GitHub comments
- **Post-Processing**: Trims inactive sections and adjusts playback speed

## Installation

```bash
cd packages/host-screenshot-collector
bun install
bun run build
```

## Usage

The collector runs inside sandbox environments and is typically started automatically by the sandbox runtime.

### Manual Execution

```bash
# Run the collector
bun run dist/index.js
```

### Output Files

Screenshots and videos are stored in `/root/screenshots/`:

| File | Description |
|------|-------------|
| `raw.mp4` | Raw screen recording |
| `events.log` | JSON-lines click event log |
| `workflow.mp4` | Processed video with cursor overlay |
| `workflow.gif` | Animated GIF preview |
| `video-metadata.json` | Recording metadata |

## Post-Processing

The embedded Python script handles video post-processing:

1. Parses click events from `events.log`
2. Overlays cursor animation at click positions
3. Trims inactive sections
4. Speeds up transitions
5. Generates GIF preview (< 20MB for Convex storage)

## Dependencies

- `@anthropic-ai/claude-agent-sdk` - Agent query interface
- `ffmpeg` - Video processing (runtime dependency)
- `python3` - Post-processing script

## Related

- `packages/sandbox/` - Sandbox runtime that invokes the collector
- `apps/server/` - Receives and stores processed recordings
