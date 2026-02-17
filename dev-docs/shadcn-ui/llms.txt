# shadcn/ui

shadcn/ui is an open-source collection of beautifully designed, accessible, and customizable React components built on top of Radix UI primitives and styled with Tailwind CSS. Unlike traditional component libraries that are installed as npm dependencies, shadcn/ui components are copied directly into your project, giving you full ownership and the ability to customize every aspect of the code. The library provides a CLI tool (`shadcn`) that streamlines initialization, component installation, and project management.

The architecture follows a "copy and own" philosophy where components are added to your codebase rather than imported from a package. This approach enables complete customization without fighting against library abstractions, supports multiple styling themes (New York, Default), and integrates seamlessly with React 19, Tailwind CSS v4, and modern frameworks like Next.js, Vite, and TanStack Start. The CLI also includes MCP (Model Context Protocol) support for AI-assisted development workflows.

---

## CLI Commands

### Initialize a New Project

The `init` command sets up shadcn/ui in your project by creating a `components.json` configuration file and installing the base styles and dependencies.

```bash
# Interactive initialization
npx shadcn@latest init

# Initialize with defaults (Next.js template, neutral color)
npx shadcn@latest init -d

# Initialize with specific options
npx shadcn@latest init --template next --base-color zinc

# Initialize with a custom style/theme from a URL
npx shadcn@latest init "https://ui.shadcn.com/r/styles/new-york"

# Initialize with RTL (right-to-left) support
npx shadcn@latest init --rtl

# Skip confirmation prompts
npx shadcn@latest init -y
```

### Add Components to Your Project

The `add` command installs components and their dependencies into your project. Components can be added from the official registry or custom registries.

```bash
# Add a single component
npx shadcn@latest add button

# Add multiple components
npx shadcn@latest add button card dialog

# Add all available components
npx shadcn@latest add --all

# Add component with overwrite (replace existing)
npx shadcn@latest add button --overwrite

# Add component from a custom registry
npx shadcn@latest add @acme/custom-button

# Add component from a URL
npx shadcn@latest add "https://my-registry.com/r/button.json"

# Add component to a specific path
npx shadcn@latest add button --path src/components/ui

# Skip confirmation prompts
npx shadcn@latest add button -y
```

### Create a New Project

The `create` command scaffolds a new project with shadcn/ui pre-configured, supporting multiple frameworks and preset configurations.

```bash
# Interactive project creation
npx shadcn@latest create

# Create with a specific name and template
npx shadcn@latest create my-app --template next

# Create with a preset configuration
npx shadcn@latest create my-app --preset default

# Create with Vite template
npx shadcn@latest create my-vite-app --template vite

# Create with TanStack Start
npx shadcn@latest create my-start-app --template start

# Create with RTL support
npx shadcn@latest create my-rtl-app --template next --rtl

# Create with src directory structure
npx shadcn@latest create my-app --template next --src-dir
```

### Check for Component Updates

The `diff` command compares your local components against the registry to identify available updates.

```bash
# Check all components for updates
npx shadcn@latest diff

# Check a specific component
npx shadcn@latest diff button

# Example output showing differences
# - button.tsx
# + bg-primary text-primary-foreground hover:bg-primary/90
# - bg-primary text-primary-foreground shadow hover:bg-primary/80
```

### Search Registries

The `search` command finds components across configured registries using fuzzy matching.

```bash
# Search in the official shadcn registry
npx shadcn@latest search @shadcn --query "button"

# Search multiple registries
npx shadcn@latest search @shadcn @acme --query "dialog"

# List all items in a registry
npx shadcn@latest search @shadcn

# Paginated search results
npx shadcn@latest search @shadcn --query "form" --limit 10 --offset 0
```

### Run Migrations

The `migrate` command helps upgrade components to new patterns or dependencies.

```bash
# List available migrations
npx shadcn@latest migrate --list

# Migrate icon library
npx shadcn@latest migrate icons

# Migrate to radix-ui package structure
npx shadcn@latest migrate radix

# Migrate components for RTL support
npx shadcn@latest migrate rtl

# Migrate specific files
npx shadcn@latest migrate rtl "src/components/**/*.tsx"

# Skip confirmation
npx shadcn@latest migrate icons -y
```

### Build Custom Registry

The `build` command compiles a custom component registry from a `registry.json` file.

```bash
# Build with default paths
npx shadcn@latest build

# Build from custom registry file
npx shadcn@latest build ./my-registry.json

# Build to custom output directory
npx shadcn@latest build ./registry.json --output ./public/registry
```

---

## Component Examples

### Button Component

The Button component supports multiple variants and sizes with full accessibility support.

```tsx
import { Button } from "@/components/ui/button"

// Basic usage
export function ButtonDemo() {
  return (
    <div className="flex flex-wrap gap-4">
      {/* Default button */}
      <Button>Click me</Button>

      {/* Variant options */}
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>

      {/* Size options */}
      <Button size="default">Default</Button>
      <Button size="sm">Small</Button>
      <Button size="lg">Large</Button>
      <Button size="icon"><IconPlus /></Button>

      {/* With icon */}
      <Button>
        <Mail className="mr-2 h-4 w-4" />
        Login with Email
      </Button>

      {/* Disabled state */}
      <Button disabled>Disabled</Button>

      {/* As child (composition pattern) */}
      <Button asChild>
        <a href="/login">Login</a>
      </Button>
    </div>
  )
}
```

### Card Component

Cards provide a flexible container for displaying grouped content with header, content, and footer sections.

```tsx
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function CardDemo() {
  return (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Create Project</CardTitle>
        <CardDescription>
          Deploy your new project in one-click.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form>
          <div className="grid w-full gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Name of your project" />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="framework">Framework</Label>
              <Select>
                <SelectTrigger id="framework">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="next">Next.js</SelectItem>
                  <SelectItem value="vite">Vite</SelectItem>
                  <SelectItem value="astro">Astro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  )
}
```

### Dialog Component

Dialogs are modal overlays that require user interaction, built on Radix UI Dialog primitives.

```tsx
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Edit Profile</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input id="name" defaultValue="Pedro Duarte" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input id="username" defaultValue="@peduarte" className="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Form with React Hook Form

The Form component integrates with React Hook Form for validation and error handling.

```tsx
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const formSchema = z.object({
  username: z.string().min(2, {
    message: "Username must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
})

export function ProfileForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormDescription>
                This is your public display name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="john@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}
```

### Table Component

The Table component provides a styled wrapper for HTML tables with proper semantics.

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const invoices = [
  { invoice: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
  { invoice: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
  { invoice: "INV003", status: "Unpaid", method: "Bank Transfer", amount: "$350.00" },
]

export function TableDemo() {
  return (
    <Table>
      <TableCaption>A list of your recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.invoice}>
            <TableCell className="font-medium">{invoice.invoice}</TableCell>
            <TableCell>{invoice.status}</TableCell>
            <TableCell>{invoice.method}</TableCell>
            <TableCell className="text-right">{invoice.amount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
```

---

## Configuration

### components.json

The `components.json` file configures shadcn/ui for your project, defining paths, styling options, and custom registries.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "rsc": true,
  "tsx": true,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide",
  "registries": {
    "acme": {
      "url": "https://acme.com/r"
    }
  }
}
```

### Utility Function (cn)

The `cn` utility combines `clsx` and `tailwind-merge` for conditional class name handling.

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Usage in components
import { cn } from "@/lib/utils"

function MyComponent({ className, variant }) {
  return (
    <div
      className={cn(
        "base-styles here",
        variant === "primary" && "bg-primary text-white",
        variant === "secondary" && "bg-secondary",
        className
      )}
    />
  )
}
```

---

## MCP Server Integration

### Configure MCP for AI Coding Assistants

The shadcn CLI includes an MCP server that enables AI assistants to interact with component registries.

```bash
# Initialize MCP for Claude Code
npx shadcn@latest mcp init --client claude

# Initialize MCP for Cursor
npx shadcn@latest mcp init --client cursor

# Initialize MCP for VS Code
npx shadcn@latest mcp init --client vscode

# Start the MCP server directly
npx shadcn@latest mcp
```

### MCP Configuration Files

```json
// .mcp.json (Claude Code)
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}

// .cursor/mcp.json (Cursor)
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}

// .vscode/mcp.json (VS Code)
{
  "servers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

---

## Programmatic API

### Fetch Registry Items

The shadcn package exports functions for programmatic registry access.

```typescript
import {
  getRegistry,
  getRegistryItems,
  resolveRegistryItems,
  getShadcnRegistryIndex,
  getRegistryStyles,
  getRegistryBaseColors,
} from "shadcn"

// Get the full registry index
const index = await getShadcnRegistryIndex()
// Returns: [{ name: "button", type: "registry:ui", ... }, ...]

// Fetch specific registry items with their content
const items = await getRegistryItems(["@shadcn/button", "@shadcn/card"], {
  config: { /* optional config */ },
  useCache: true,
})

// Resolve items with all dependencies
const resolvedItems = await resolveRegistryItems(["@shadcn/dialog"], {
  config: { /* optional config */ },
})

// Get available styles
const styles = await getRegistryStyles()
// Returns: [{ name: "new-york", label: "New York" }, { name: "default", label: "Default" }]

// Get base color options
const baseColors = await getRegistryBaseColors()
// Returns: [{ name: "neutral", label: "Neutral" }, { name: "zinc", label: "Zinc" }, ...]

// Fetch a custom registry
const customRegistry = await getRegistry("https://my-registry.com/r/registry.json")
```

### Search Registries Programmatically

```typescript
import { searchRegistries } from "shadcn/registry"

const results = await searchRegistries(["@shadcn"], {
  query: "button",
  limit: 10,
  offset: 0,
  config: { /* components.json config */ },
})

// Results include:
// {
//   items: [{ name: "button", type: "registry:ui", description: "..." }],
//   total: 45,
//   hasMore: true,
// }
```

---

## Custom Registry

### Creating a Custom Component Registry

Build and publish your own component registry for sharing across projects or teams.

```json
// registry.json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "acme",
  "homepage": "https://acme.com",
  "items": [
    {
      "name": "fancy-button",
      "type": "registry:ui",
      "description": "A fancy button with animations",
      "dependencies": ["framer-motion"],
      "files": [
        {
          "path": "components/ui/fancy-button.tsx",
          "type": "registry:ui"
        }
      ]
    },
    {
      "name": "data-table",
      "type": "registry:component",
      "description": "Advanced data table with sorting and filtering",
      "registryDependencies": ["table", "button", "input"],
      "dependencies": ["@tanstack/react-table"],
      "files": [
        {
          "path": "components/data-table.tsx",
          "type": "registry:component"
        }
      ]
    }
  ]
}
```

```bash
# Build the registry
npx shadcn@latest build ./registry.json --output ./public/r

# This creates:
# ./public/r/registry.json
# ./public/r/fancy-button.json
# ./public/r/data-table.json
```

### Using Custom Registries

```json
// components.json
{
  "registries": {
    "acme": {
      "url": "https://acme.com/r"
    },
    "internal": {
      "url": "https://internal.company.com/registry",
      "headers": {
        "Authorization": "Bearer ${REGISTRY_TOKEN}"
      }
    }
  }
}
```

```bash
# Add components from custom registries
npx shadcn@latest add @acme/fancy-button
npx shadcn@latest add @internal/dashboard-layout

# Search custom registries
npx shadcn@latest search @acme --query "button"
```

---

## Summary

shadcn/ui provides a flexible foundation for building React applications with a comprehensive set of accessible, customizable UI components. The "copy and own" model ensures developers maintain full control over their component code while benefiting from well-tested, production-ready implementations. The CLI streamlines project setup, component management, and updates, making it easy to maintain consistency across projects.

Integration patterns include direct usage of UI primitives for simple interfaces, composition with React Hook Form and Zod for complex forms, extension through custom registries for team-specific components, and AI-assisted development via MCP server integration. The architecture supports modern React features including Server Components, works seamlessly with Tailwind CSS v4 and CSS variables for theming, and provides first-class TypeScript support throughout the component library.
