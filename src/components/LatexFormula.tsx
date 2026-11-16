import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LatexFormulaProps {
  latex: string;
  displayMode?: boolean;
  className?: string;
}

export function LatexFormula({ latex, displayMode = true, className = '' }: LatexFormulaProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return '';
    }
  }, [latex, displayMode]);

  if (!html) {
    return <code className={`font-mono text-xs text-[#2A332E] ${className}`}>{latex}</code>;
  }

  return (
    <div
      className={`overflow-x-auto text-[#151B18] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
