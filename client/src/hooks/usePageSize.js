import { useState, useLayoutEffect, useCallback } from 'react';

/**
 * Calculates how many rows fit in the available viewport height.
 *
 * @param {number} rowHeight      - Height of a single row/card in px
 * @param {number} reservedHeight - Total px consumed by non-row chrome
 *                                  (toolbar, search, table header, pagination, padding)
 * @param {number} [min=5]        - Minimum page size regardless of viewport
 * @param {number} [max=50]       - Maximum page size regardless of viewport
 * @returns {number} pageSize
 */
export default function usePageSize(rowHeight, reservedHeight, min = 5, max = 50) {
  const calc = useCallback(() => {
    const available = window.innerHeight - reservedHeight;
    return Math.min(max, Math.max(min, Math.floor(available / rowHeight)));
  }, [rowHeight, reservedHeight, min, max]);

  const [pageSize, setPageSize] = useState(calc);

  useLayoutEffect(() => {
    setPageSize(calc());
    const ro = new ResizeObserver(() => setPageSize(calc()));
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [calc]);

  return pageSize;
}
