'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { useUser } from '@stackframe/stack';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const user = useUser({ or: 'return-null' });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        capture_pageview: false, // We'll capture manually
        capture_pageleave: true,
      });
    }
  }, []);

  useEffect(() => {
    if (user) {
      posthog.identify(user.id, {
        email: user.primaryEmail,
        name: user.displayName,
      });
    } else {
      posthog.reset();
    }
  }, [user]);

  return <>{children}</>;
}