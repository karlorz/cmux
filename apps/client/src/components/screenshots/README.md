# Screenshot Gallery Components

This directory contains reusable screenshot gallery components that can be used throughout the application.

## Components

### ScreenshotGallery

A reusable screenshot gallery component with slideshow, zoom, and pan capabilities.

#### Usage Examples

##### Basic Usage
```tsx
import { ScreenshotGallery } from './screenshots/ScreenshotGallery';

<ScreenshotGallery
  screenshotSets={screenshotSets}
  highlightedSetId={selectedSetId}
/>
```

##### Compact Mode (for inline display)
```tsx
<ScreenshotGallery
  screenshotSets={screenshotSets}
  highlightedSetId={selectedSetId}
  compact
  showHeader={false}
/>
```

##### With Custom Click Handler
```tsx
<ScreenshotGallery
  screenshotSets={screenshotSets}
  onImageClick={(image, set) => {
    console.log('Image clicked:', image.fileName);
  }}
/>
```

### TaskRunGitDiffPanel (Enhanced)

The `TaskRunGitDiffPanel` component has been enhanced to optionally display screenshots alongside git diffs.

#### Usage Examples

##### With Screenshots at Top
```tsx
<TaskRunGitDiffPanel
  task={task}
  selectedRun={selectedRun}
  screenshotSets={screenshotSets}
  highlightedSetId={latestScreenshotSetId}
  showScreenshots
  screenshotsPosition="top"
/>
```

##### With Inline Collapsible Screenshots
```tsx
<TaskRunGitDiffPanel
  task={task}
  selectedRun={selectedRun}
  screenshotSets={screenshotSets}
  highlightedSetId={latestScreenshotSetId}
  showScreenshots
  screenshotsPosition="inline"
/>
```

##### Without Screenshots (backward compatible)
```tsx
<TaskRunGitDiffPanel
  task={task}
  selectedRun={selectedRun}
/>
```

## Features

- **Slideshow Mode**: Click on any screenshot to open it in a full-screen slideshow
- **Zoom & Pan**: Mouse wheel to zoom, drag to pan when zoomed in
- **Keyboard Navigation**: Arrow keys to navigate between screenshots in slideshow mode
- **Dark Mode Support**: Fully supports light and dark themes
- **Responsive Design**: Works well on different screen sizes
- **Lazy Loading**: Images are loaded as needed for better performance

## Props

### ScreenshotGallery Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| screenshotSets | ScreenshotSet[] | required | Array of screenshot sets to display |
| highlightedSetId | Id | null | ID of the set to highlight (usually the latest) |
| title | string | "Screenshots" | Title text for the gallery header |
| className | string | - | Additional CSS classes |
| compact | boolean | false | Use compact layout for inline display |
| showHeader | boolean | true | Whether to show the header section |
| onImageClick | function | - | Custom handler for image clicks |

### TaskRunGitDiffPanel Enhanced Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| task | Doc<"tasks"> | required | Task document |
| selectedRun | TaskRunWithChildren | required | Selected run to display |
| screenshotSets | ScreenshotSet[] | [] | Screenshot sets to display |
| highlightedSetId | Id | null | ID of the highlighted screenshot set |
| showScreenshots | boolean | false | Whether to show screenshots |
| screenshotsPosition | "top" \| "bottom" \| "inline" | "top" | Where to display screenshots |