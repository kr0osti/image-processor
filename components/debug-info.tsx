"use client";

import { useEffect } from 'react';

export function DebugInfo() {
  useEffect(() => {
    console.log("Debug Info Component Loaded");
    console.log("NEXT_PUBLIC_DEBUG value:", process.env.NEXT_PUBLIC_DEBUG);
    
    // Log all environment variables that start with NEXT_PUBLIC_
    const publicEnvVars = Object.keys(process.env)
      .filter(key => key.startsWith('NEXT_PUBLIC_'))
      .reduce((obj, key) => {
        obj[key] = process.env[key];
        return obj;
      }, {} as Record<string, string | undefined>);
    
    console.log("All public env vars:", publicEnvVars);
  }, []);

  // Only render in development or when debug is enabled
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return null;
  }

  return (
    <div className="fixed bottom-0 right-0 bg-black/80 text-white p-2 text-xs z-50">
      <div>Debug: {process.env.NEXT_PUBLIC_DEBUG}</div>
      <div>Node Env: {process.env.NODE_ENV}</div>
    </div>
  );
}