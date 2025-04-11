"use client"

import React, { useEffect, useState } from "react"
import {
  hslToRgb,
  calculateContrastRatio,
  meetsWCAGAA,
  meetsWCAGAAA
} from "@/lib/accessibility"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle, Info } from "lucide-react"

/**
 * Component to check and display color contrast information for the application
 */
/**
 * Interface for contrast issue objects
 */
interface ContrastIssue {
  /** HTML element tag name */
  element: string;
  /** Foreground color (text color) */
  foreground: string;
  /** Background color */
  background: string;
  /** Calculated contrast ratio */
  ratio: number;
  /** WCAG compliance level */
  passes: 'AA' | 'AAA' | 'Fail';
}

/**
 * AccessibilityChecker component scans the page for color contrast issues
 * and displays them to help developers identify and fix accessibility problems.
 *
 * @returns {JSX.Element|null} The rendered component or null if no issues found
 */
export function AccessibilityChecker() {
  const [contrastIssues, setContrastIssues] = useState<Array<ContrastIssue>>([]);

  /**
   * Effect hook to check for contrast issues when the component mounts
   */
  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;

    /**
     * Checks the page for color contrast issues
     * Analyzes text elements and their backgrounds to identify WCAG compliance problems
     */
    const checkContrast = () => {
      const issues: Array<{
        element: string;
        foreground: string;
        background: string;
        ratio: number;
        passes: 'AA' | 'AAA' | 'Fail';
      }> = [];

      // Get CSS variables from :root
      const rootStyles = getComputedStyle(document.documentElement);

      // Check text contrast
      const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, label, input, textarea');

      textElements.forEach(element => {
        const styles = getComputedStyle(element as HTMLElement);
        const foregroundColor = styles.color;
        const backgroundColor = styles.backgroundColor;

        // Skip elements with transparent background
        if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') return;

        // Parse RGB values
        const fgMatch = foregroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        const bgMatch = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

        if (fgMatch && bgMatch) {
          const fgRgb: [number, number, number] = [
            parseInt(fgMatch[1]),
            parseInt(fgMatch[2]),
            parseInt(fgMatch[3])
          ];

          const bgRgb: [number, number, number] = [
            parseInt(bgMatch[1]),
            parseInt(bgMatch[2]),
            parseInt(bgMatch[3])
          ];

          const ratio = calculateContrastRatio(fgRgb, bgRgb);
          const fontSize = parseFloat(styles.fontSize);
          const fontWeight = styles.fontWeight;
          const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= '700');

          let passes: 'AA' | 'AAA' | 'Fail' = 'Fail';

          if (meetsWCAGAAA(ratio, isLargeText)) {
            passes = 'AAA';
          } else if (meetsWCAGAA(ratio, isLargeText)) {
            passes = 'AA';
          }

          if (passes === 'Fail') {
            issues.push({
              element: (element as HTMLElement).tagName.toLowerCase(),
              foreground: foregroundColor,
              background: backgroundColor,
              ratio,
              passes
            });
          }
        }
      });

      setContrastIssues(issues);
    };

    // Run the check after a short delay to ensure the page is fully rendered
    const timer = setTimeout(checkContrast, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (contrastIssues.length === 0) {
    return null;
  }

  return (
    <Card className="max-w-lg mx-auto my-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Accessibility Contrast Issues
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Found {contrastIssues.length} elements with insufficient color contrast.
            This tool is for development purposes only.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {contrastIssues.map((issue, index) => (
            <div key={index} className="p-3 border rounded-md">
              <div className="font-medium">{issue.element} Element</div>
              <div className="text-sm mt-1">
                <div>Foreground: {issue.foreground}</div>
                <div>Background: {issue.background}</div>
                <div className="flex items-center mt-1">
                  <span className="font-medium">Contrast ratio: {issue.ratio.toFixed(2)}</span>
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">
                    Failed WCAG AA
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
